import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { profilesTable, apiKeysTable, modelsTable } from "@workspace/db";
import { requireLayerAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function pickKeyAndMaybeAdvance(
  profileId: number,
  rotationMode: string,
  currentIndex: number,
  keys: { id: number; keyValue: string; disabled: boolean }[],
) {
  const enabled: { idx: number; key: typeof keys[number] }[] = [];
  keys.forEach((k, i) => {
    if (!k.disabled) enabled.push({ idx: i, key: k });
  });
  if (enabled.length === 0) return null;

  const currentPos = enabled.findIndex((e) => e.idx === currentIndex);
  const useEntry = currentPos === -1 ? enabled[0] : enabled[currentPos];

  if (rotationMode === "round-robin") {
    const nextEntry =
      currentPos === -1
        ? (enabled[1] ?? enabled[0])
        : enabled[(currentPos + 1) % enabled.length];
    await db
      .update(profilesTable)
      .set({ currentKeyIndex: nextEntry.idx })
      .where(eq(profilesTable.id, profileId));
  } else if (currentPos === -1) {
    // In manual mode, if the current pointer somehow lands on a disabled
    // key (e.g. user just disabled it), snap forward to the first enabled
    // one but do not auto-advance afterward.
    await db
      .update(profilesTable)
      .set({ currentKeyIndex: useEntry.idx })
      .where(eq(profilesTable.id, profileId));
  }

  return { key: useEntry.key, idx: useEntry.idx };
}

function buildForwardHeaders(req: import("express").Request, keyValue: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower === "authorization"
    ) continue;
    if (typeof v === "string") headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(", ");
  }
  headers["Authorization"] = `Bearer ${keyValue.trim()}`;
  return headers;
}

router.get("/v1/models", requireLayerAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      profileName: profilesTable.name,
      modelName: modelsTable.modelName,
      createdAt: modelsTable.createdAt,
    })
    .from(modelsTable)
    .innerJoin(profilesTable, eq(profilesTable.id, modelsTable.profileId))
    .where(eq(modelsTable.disabled, false))
    .orderBy(asc(profilesTable.name), asc(modelsTable.modelName));

  const data = rows.map((r) => ({
    id: `${r.profileName} - ${r.modelName}`,
    object: "model",
    owned_by: r.profileName,
    created: Math.floor(new Date(r.createdAt).getTime() / 1000),
  }));

  res.json({ object: "list", data });
});

router.post("/v1/chat/completions", requireLayerAuth, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const rawModel = typeof body?.model === "string" ? body.model : "";

  req.log.info({ requestBody: body }, "Incoming chat/completions request");

  const separatorIdx = rawModel.indexOf(" - ");
  if (separatorIdx === -1) {
    req.log.warn({ rawModel }, "Rejected: invalid model format");
    res.status(400).json({
      error: {
        message: `Invalid model format "${rawModel}". Expected "ProfileName - ModelName".`,
        type: "invalid_request_error",
      },
    });
    return;
  }

  const profileName = rawModel.substring(0, separatorIdx);
  const actualModel = rawModel.substring(separatorIdx + 3);

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.name, profileName));

  if (!profile) {
    res.status(404).json({
      error: {
        message: `Profile "${profileName}" not found.`,
        type: "invalid_request_error",
      },
    });
    return;
  }

  // Verify the model is enabled for this profile (if any are tracked).
  const tracked = await db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.profileId, profile.id));
  if (tracked.length > 0) {
    const found = tracked.find((m) => m.modelName === actualModel);
    if (!found) {
      res.status(404).json({
        error: {
          message: `Model "${actualModel}" is not registered for profile "${profileName}".`,
          type: "invalid_request_error",
        },
      });
      return;
    }
    if (found.disabled) {
      res.status(403).json({
        error: {
          message: `Model "${actualModel}" is disabled for profile "${profileName}".`,
          type: "invalid_request_error",
        },
      });
      return;
    }
  }

  const keys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.profileId, profile.id))
    .orderBy(asc(apiKeysTable.createdAt));

  if (keys.length === 0) {
    res.status(400).json({
      error: {
        message: `No API keys configured for profile "${profileName}".`,
        type: "invalid_request_error",
      },
    });
    return;
  }

  const picked = await pickKeyAndMaybeAdvance(
    profile.id,
    profile.rotationMode,
    profile.currentKeyIndex,
    keys,
  );
  if (!picked) {
    res.status(400).json({
      error: {
        message: `No enabled API keys for profile "${profileName}".`,
        type: "invalid_request_error",
      },
    });
    return;
  }
  const { key, idx } = picked;

  const targetUrl = `${profile.targetUrl.replace(/\/$/, "")}/chat/completions`;
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const fullUrl = `${targetUrl}${queryString}`;

  const forwardedBody = { ...body, model: actualModel };
  const bodyContent = JSON.stringify(forwardedBody);

  const headers = buildForwardHeaders(req, key.keyValue);
  headers["Content-Type"] = "application/json";
  headers["Content-Length"] = Buffer.byteLength(bodyContent).toString();

  req.log.info(
    {
      profile: profileName,
      model: actualModel,
      keyIndex: idx,
      rotationMode: profile.rotationMode,
      targetUrl: fullUrl,
      requestBody: forwardedBody,
    },
    "Forwarding chat/completions request",
  );

  const upstream = await fetch(fullUrl, {
    method: "POST",
    headers,
    body: bodyContent,
  });

  res.status(upstream.status);

  upstream.headers.forEach((value, headerKey) => {
    const lower = headerKey.toLowerCase();
    if (lower === "transfer-encoding" || lower === "content-encoding") return;
    res.setHeader(headerKey, value);
  });

  const isStream = (forwardedBody as Record<string, unknown>).stream === true;

  if (isStream && upstream.body) {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    const flush = () => {
      if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
        (res as unknown as { flush: () => void }).flush();
      }
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        res.write(Buffer.from(value));
        flush();
      }
    } finally {
      res.end();
      const fullResponse = Buffer.concat(chunks).toString("utf8");
      req.log.info({ status: upstream.status, responseBody: fullResponse }, "Upstream stream response");
    }
  } else {
    const responseBody = await upstream.arrayBuffer();
    const responseText = Buffer.from(responseBody).toString("utf8");
    req.log.info({ status: upstream.status, responseBody: responseText }, "Upstream response");
    res.send(Buffer.from(responseBody));
  }
});

void and;

export default router;
