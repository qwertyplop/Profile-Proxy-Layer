import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { layerAccessKeysTable } from "@workspace/db";

export async function requireLayerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const totalKeys = await db
    .select({ id: layerAccessKeysTable.id })
    .from(layerAccessKeysTable);

  if (totalKeys.length === 0) {
    next();
    return;
  }

  const authHeader = req.headers["authorization"];
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({
      error: {
        message: "Missing Authorization header. Use: Authorization: Bearer <key>",
        type: "invalid_request_error",
        code: "missing_api_key",
      },
    });
    return;
  }

  const [match] = await db
    .select()
    .from(layerAccessKeysTable)
    .where(eq(layerAccessKeysTable.keyValue, token));

  if (!match) {
    res.status(401).json({
      error: {
        message: "Invalid API key.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    return;
  }

  next();
}
