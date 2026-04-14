import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { profilesTable, apiKeysTable } from "@workspace/db";
import {
  CreateProfileBody,
  GetProfileParams,
  UpdateProfileParams,
  UpdateProfileBody,
  DeleteProfileParams,
  ListProfileKeysParams,
  AddProfileKeyParams,
  AddProfileKeyBody,
  DeleteProfileKeyParams,
  RotateProfileKeyParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getProfileWithKeys(id: number) {
  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, id))
    .then((r) => r[0] ?? null);

  if (!profile) return null;

  const keys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.profileId, id))
    .orderBy(asc(apiKeysTable.createdAt));

  return { ...profile, keys };
}

router.get("/profiles", async (_req, res): Promise<void> => {
  const profiles = await db
    .select()
    .from(profilesTable)
    .orderBy(asc(profilesTable.createdAt));

  const results = await Promise.all(
    profiles.map(async (p) => {
      const keys = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.profileId, p.id))
        .orderBy(asc(apiKeysTable.createdAt));
      return { ...p, keys };
    }),
  );

  res.json(results);
});

router.post("/profiles", async (req, res): Promise<void> => {
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .insert(profilesTable)
    .values({
      name: parsed.data.name,
      targetUrl: parsed.data.targetUrl,
    })
    .returning();

  res.status(201).json({ ...profile, keys: [] });
});

router.get("/profiles/:id", async (req, res): Promise<void> => {
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const profile = await getProfileWithKeys(params.data.id);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(profile);
});

router.patch("/profiles/:id", async (req, res): Promise<void> => {
  const params = UpdateProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof profilesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.targetUrl !== undefined)
    updateData.targetUrl = parsed.data.targetUrl;

  if (Object.keys(updateData).length === 0) {
    const profile = await getProfileWithKeys(params.data.id);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json(profile);
    return;
  }

  const [updated] = await db
    .update(profilesTable)
    .set(updateData)
    .where(eq(profilesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const profile = await getProfileWithKeys(updated.id);
  res.json(profile);
});

router.delete("/profiles/:id", async (req, res): Promise<void> => {
  const params = DeleteProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(profilesTable)
    .where(eq(profilesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/profiles/:id/keys", async (req, res): Promise<void> => {
  const params = ListProfileKeysParams.safeParse(req.params);
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
    .where(eq(apiKeysTable.profileId, params.data.id))
    .orderBy(asc(apiKeysTable.createdAt));

  res.json(keys);
});

router.post("/profiles/:id/keys", async (req, res): Promise<void> => {
  const params = AddProfileKeyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddProfileKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  const [key] = await db
    .insert(apiKeysTable)
    .values({
      profileId: params.data.id,
      keyValue: parsed.data.keyValue.trim(),
      label: parsed.data.label ?? null,
    })
    .returning();

  res.status(201).json(key);
});

router.delete("/profiles/:id/keys/:keyId", async (req, res): Promise<void> => {
  const params = DeleteProfileKeyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(apiKeysTable)
    .where(eq(apiKeysTable.id, params.data.keyId))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Key not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/profiles/:id/rotate-key", async (req, res): Promise<void> => {
  const params = RotateProfileKeyParams.safeParse(req.params);
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
    .where(eq(apiKeysTable.profileId, params.data.id))
    .orderBy(asc(apiKeysTable.createdAt));

  if (keys.length === 0) {
    res.status(400).json({ error: "No keys to rotate" });
    return;
  }

  const nextIndex = (profile.currentKeyIndex + 1) % keys.length;

  const [updated] = await db
    .update(profilesTable)
    .set({ currentKeyIndex: nextIndex })
    .where(eq(profilesTable.id, params.data.id))
    .returning();

  res.json({ ...updated, keys });
});

export default router;
