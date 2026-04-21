import { type Request, type Response, type NextFunction } from "express";
import { eq, gt, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { layerAccessKeysTable, sessionsTable, usersTable } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      username?: string;
    }
  }
}

export const SESSION_COOKIE = "session_id";

async function loadSession(req: Request): Promise<{ userId: number; username: string } | null> {
  const cookies = req.cookies as Record<string, string> | undefined;
  const sid = cookies?.[SESSION_COOKIE];
  if (!sid) return null;

  const [row] = await db
    .select({
      userId: sessionsTable.userId,
      username: usersTable.username,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
    .where(and(eq(sessionsTable.id, sid), gt(sessionsTable.expiresAt, new Date())));

  if (!row) return null;
  return { userId: row.userId, username: row.username };
}

export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await loadSession(req);
  if (session) {
    req.userId = session.userId;
    req.username = session.username;
  }
  next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required.", code: "unauthenticated" });
    return;
  }
  next();
}

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
