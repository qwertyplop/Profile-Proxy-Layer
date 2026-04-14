import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const layerAccessKeysTable = pgTable("layer_access_keys", {
  id: serial("id").primaryKey(),
  label: text("label"),
  keyValue: text("key_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLayerAccessKeySchema = createInsertSchema(layerAccessKeysTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLayerAccessKey = z.infer<typeof insertLayerAccessKeySchema>;
export type LayerAccessKey = typeof layerAccessKeysTable.$inferSelect;
