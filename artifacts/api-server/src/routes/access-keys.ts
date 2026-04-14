import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { layerAccessKeysTable } from "@workspace/db";
import {
  CreateAccessKeyBody,
  DeleteAccessKeyParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function generateKey(): string {
  return `px-${randomBytes(24).toString("hex")}`;
}

router.get("/access-keys", async (_req, res): Promise<void> => {
  const keys = await db
    .select()
    .from(layerAccessKeysTable)
    .orderBy(asc(layerAccessKeysTable.createdAt));
  res.json(keys);
});

router.post("/access-keys", async (req, res): Promise<void> => {
  const parsed = CreateAccessKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [key] = await db
    .insert(layerAccessKeysTable)
    .values({
      keyValue: generateKey(),
      label: parsed.data.label ?? null,
    })
    .returning();

  res.status(201).json(key);
});

router.delete("/access-keys/:id", async (req, res): Promise<void> => {
  const params = DeleteAccessKeyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(layerAccessKeysTable)
    .where(eq(layerAccessKeysTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Access key not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
