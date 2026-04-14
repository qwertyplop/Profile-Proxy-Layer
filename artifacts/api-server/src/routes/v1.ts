import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { profilesTable, apiKeysTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireLayerAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function getProfileKey(profileId: number, currentIndex: number, keys: { id: number; keyValue: string }[]) {
  const idx = currentIndex % keys.length;
  const key = keys[idx];
  const nextIndex = (idx + 1) % keys.length;
  await db
    .update(profilesTable)
    .set({ currentKeyIndex: nextIndex })
    .where(eq(profilesTable.id, profileId));
  return { key, idx };
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
  headers["Authorization"] = `Bearer ${keyValue}`;
  return headers;
}

router.get("/v1/models", requireLayerAuth, async (req, res): Promise<void> => {
  const profiles = await db
    .select()
    .from(profilesTable)
    .orderBy(asc(profilesTable.createdAt));

  if (profiles.length === 0) {
    res.json({ object: "list", data: [] });
    return;
  }

  const allModels: { id: string; object: string; owned_by: string; created: number }[] = [];

  await Promise.all(
    profiles.map(async (profile) => {
      const keys = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.profileId, profile.id))
        .orderBy(asc(apiKeysTable.createdAt));

      if (keys.length === 0) return;

      const { key, idx } = await getProfileKey(profile.id, profile.currentKeyIndex, keys);

      const modelsUrl = `${profile.targetUrl.replace(/\/$/, "")}/models`;

      try {
        const upstream = await fetch(modelsUrl, {
          headers: {
            Authorization: `Bearer ${key.keyValue}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!upstream.ok) {
          req.log.warn({ profile: profile.name, status: upstream.status }, "Models fetch failed");
          return;
        }

        const body = (await upstream.json()) as { data?: { id: string; object?: string; owned_by?: string; created?: number }[] };
        const data = Array.isArray(body?.data) ? body.data : [];

        for (const model of data) {
          allModels.push({
            id: `${profile.name} - ${model.id}`,
            object: "model",
            owned_by: profile.name,
            created: model.created ?? Math.floor(Date.now() / 1000),
          });
        }
      } catch (err) {
        logger.warn({ profile: profile.name, err }, "Failed to fetch models from profile");
      }

      void idx;
    }),
  );

  res.json({ object: "list", data: allModels });
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

  const { key, idx } = await getProfileKey(profile.id, profile.currentKeyIndex, keys);

  const targetUrl = `${profile.targetUrl.replace(/\/$/, "")}/chat/completions`;
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const fullUrl = `${targetUrl}${queryString}`;

  const forwardedBody = { ...body, model: actualModel };
  const bodyContent = JSON.stringify(forwardedBody);

  const headers = buildForwardHeaders(req, key.keyValue);
  headers["Content-Type"] = "application/json";
  headers["Content-Length"] = Buffer.byteLength(bodyContent).toString();

  req.log.info(
    { profile: profileName, model: actualModel, keyIndex: idx, targetUrl: fullUrl, requestBody: forwardedBody },
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

  const isStream = forwardedBody.stream === true;

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

export default router;
