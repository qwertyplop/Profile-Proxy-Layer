import { Router, type IRouter } from "express";
import { eq, asc, and, inArray, notInArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { profilesTable, apiKeysTable, modelsTable } from "@workspace/db";
import {
  ListProfileModelsParams,
  AddProfileModelParams,
  AddProfileModelBody,
  UpdateProfileModelParams,
  UpdateProfileModelBody,
  DeleteProfileModelParams,
  RefreshProfileModelsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/profiles/:id/models", async (req, res): Promise<void> => {
  const params = ListProfileModelsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, params.data.id))
    .then((r) => r[0] ?? null);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const models = await db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.profileId, params.data.id))
    .orderBy(asc(modelsTable.modelName));

  res.json(models);
});

router.post("/profiles/:id/models", async (req, res): Promise<void> => {
  const params = AddProfileModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddProfileModelBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, params.data.id))
    .then((r) => r[0] ?? null);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const modelName = body.data.modelName.trim();
  if (!modelName) {
    res.status(400).json({ error: "modelName is required" });
    return;
  }

  try {
    const [model] = await db
      .insert(modelsTable)
      .values({
        profileId: params.data.id,
        modelName,
        source: "manual",
      })
      .returning();

    res.status(201).json(model);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      res.status(400).json({ error: `Model "${modelName}" already exists for this profile` });
      return;
    }
    throw err;
  }
});

router.patch("/profiles/:id/models/:modelId", async (req, res): Promise<void> => {
  const params = UpdateProfileModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProfileModelBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.disabled !== undefined) updates.disabled = body.data.disabled;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(modelsTable)
    .set(updates)
    .where(
      and(
        eq(modelsTable.id, params.data.modelId),
        eq(modelsTable.profileId, params.data.id),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  res.json(updated);
});

router.delete("/profiles/:id/models/:modelId", async (req, res): Promise<void> => {
  const params = DeleteProfileModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(modelsTable)
    .where(
      and(
        eq(modelsTable.id, params.data.modelId),
        eq(modelsTable.profileId, params.data.id),
      ),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/profiles/:id/models/refresh", async (req, res): Promise<void> => {
  const params = RefreshProfileModelsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, params.data.id))
    .then((r) => r[0] ?? null);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const keys = await db
    .select()
    .from(apiKeysTable)
    .where(
      and(eq(apiKeysTable.profileId, params.data.id), eq(apiKeysTable.disabled, false)),
    )
    .orderBy(asc(apiKeysTable.createdAt));

  if (keys.length === 0) {
    res.status(400).json({ error: "Profile has no enabled API keys to fetch models with" });
    return;
  }

  const key = keys[profile.currentKeyIndex % keys.length] ?? keys[0];
  const modelsUrl = `${profile.targetUrl.replace(/\/$/, "")}/models`;

  let upstream: Response;
  try {
    upstream = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${key.keyValue}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    res.status(400).json({
      error: `Failed to reach upstream: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    res.status(400).json({
      error: `Upstream /models returned ${upstream.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    });
    return;
  }

  let body: { data?: { id: string }[] };
  try {
    body = (await upstream.json()) as { data?: { id: string }[] };
  } catch {
    res.status(400).json({ error: "Upstream /models response was not valid JSON" });
    return;
  }

  const fetchedNames = Array.isArray(body?.data)
    ? Array.from(
        new Set(
          body.data
            .map((m) => (typeof m?.id === "string" ? m.id.trim() : ""))
            .filter((s) => s.length > 0),
        ),
      )
    : [];

  const existing = await db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.profileId, params.data.id));

  const existingByName = new Map(existing.map((m) => [m.modelName, m]));
  const fetchedSet = new Set(fetchedNames);

  let added = 0;
  let removed = 0;

  const toInsert: { profileId: number; modelName: string; source: string }[] = [];
  for (const name of fetchedNames) {
    if (!existingByName.has(name)) {
      toInsert.push({ profileId: params.data.id, modelName: name, source: "fetched" });
      added += 1;
    }
  }
  if (toInsert.length > 0) {
    await db.insert(modelsTable).values(toInsert);
  }

  const staleFetchedIds = existing
    .filter((m) => m.source === "fetched" && !fetchedSet.has(m.modelName))
    .map((m) => m.id);

  if (staleFetchedIds.length > 0) {
    const deleted = await db
      .delete(modelsTable)
      .where(
        and(
          eq(modelsTable.profileId, params.data.id),
          inArray(modelsTable.id, staleFetchedIds),
        ),
      )
      .returning();
    removed = deleted.length;
  }

  void notInArray;

  const models = await db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.profileId, params.data.id))
    .orderBy(asc(modelsTable.modelName));

  res.json({ added, removed, total: models.length, models });
});

export default router;
