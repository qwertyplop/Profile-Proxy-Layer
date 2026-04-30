import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { profilesTable, apiKeysTable } from "@workspace/db";

const router: IRouter = Router();

router.all("/proxy/:profileName/{*splat}", async (req, res): Promise<void> => {
  const { profileName } = req.params;
  const splat = Array.isArray(req.params.splat)
    ? req.params.splat.join("/")
    : req.params.splat ?? "";

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.name, profileName));

  if (!profile) {
    res.status(404).json({ error: `Profile "${profileName}" not found` });
    return;
  }

  const keys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.profileId, profile.id))
    .orderBy(asc(apiKeysTable.createdAt));

  if (keys.length === 0) {
    res.status(400).json({ error: "No API keys configured for this profile" });
    return;
  }

  const enabled: { idx: number; key: typeof keys[number] }[] = [];
  keys.forEach((k, i) => {
    if (!k.disabled) enabled.push({ idx: i, key: k });
  });

  if (enabled.length === 0) {
    res.status(400).json({ error: "No enabled API keys for this profile" });
    return;
  }

  const currentPos = enabled.findIndex((e) => e.idx === profile.currentKeyIndex);
  const useEntry = currentPos === -1 ? enabled[0] : enabled[currentPos];
  const currentKey = useEntry.key;
  const usedIdx = useEntry.idx;

  if (profile.rotationMode === "round-robin") {
    const nextEntry =
      currentPos === -1
        ? (enabled[1] ?? enabled[0])
        : enabled[(currentPos + 1) % enabled.length];
    await db
      .update(profilesTable)
      .set({ currentKeyIndex: nextEntry.idx })
      .where(eq(profilesTable.id, profile.id));
  } else if (currentPos === -1) {
    await db
      .update(profilesTable)
      .set({ currentKeyIndex: usedIdx })
      .where(eq(profilesTable.id, profile.id));
  }

  const targetPath = splat ? `/${splat}` : "";
  const targetUrl = `${profile.targetUrl.replace(/\/$/, "")}${targetPath}`;

  const queryString = req.url.includes("?")
    ? req.url.substring(req.url.indexOf("?"))
    : "";
  const fullUrl = `${targetUrl}${queryString}`;

  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      key.toLowerCase() === "host" ||
      key.toLowerCase() === "connection" ||
      key.toLowerCase() === "content-length"
    ) {
      continue;
    }
    if (typeof value === "string") {
      forwardHeaders[key] = value;
    } else if (Array.isArray(value)) {
      forwardHeaders[key] = value.join(", ");
    }
  }

  forwardHeaders["Authorization"] = `Bearer ${currentKey.keyValue}`;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const bodyContent = hasBody ? JSON.stringify(req.body) : undefined;
  if (hasBody && bodyContent) {
    forwardHeaders["Content-Length"] = Buffer.byteLength(bodyContent).toString();
  }

  req.log.info(
    { profile: profileName, targetUrl: fullUrl, keyIndex: usedIdx, rotationMode: profile.rotationMode },
    "Forwarding proxy request",
  );

  const upstream = await fetch(fullUrl, {
    method: req.method,
    headers: forwardHeaders,
    body: bodyContent,
  });

  res.status(upstream.status);

  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  const responseBody = await upstream.arrayBuffer();
  res.send(Buffer.from(responseBody));
});

export default router;
