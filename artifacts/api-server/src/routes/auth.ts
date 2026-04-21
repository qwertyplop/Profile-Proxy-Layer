import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/passwords";
import { SESSION_COOKIE } from "../middlewares/auth";

const router: IRouter = Router();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function setSessionCookie(res: import("express").Response, sid: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env["NODE_ENV"] === "production",
    expires: expiresAt,
    path: "/",
  });
}

function clearSessionCookie(res: import("express").Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

async function userCount(): Promise<number> {
  const rows = await db.select({ id: usersTable.id }).from(usersTable);
  return rows.length;
}

router.get("/auth/status", async (req, res): Promise<void> => {
  const count = await userCount();
  res.json({
    registrationOpen: count === 0,
    authenticated: Boolean(req.userId),
    username: req.username ?? null,
  });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const { username, password } = (req.body ?? {}) as {
    username?: unknown;
    password?: unknown;
  };

  if (typeof username !== "string" || username.trim().length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters." });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  if ((await userCount()) > 0) {
    res.status(403).json({
      error: "Registration is closed. An owner account already exists.",
    });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({ username: username.trim(), passwordHash: hashPassword(password) })
    .returning();

  const sid = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ id: sid, userId: user.id, expiresAt });

  setSessionCookie(res, sid, expiresAt);
  res.json({ username: user.username });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = (req.body ?? {}) as {
    username?: unknown;
    password?: unknown;
  };

  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.trim()));

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const sid = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ id: sid, userId: user.id, expiresAt });

  setSessionCookie(res, sid, expiresAt);
  res.json({ username: user.username });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const cookies = req.cookies as Record<string, string> | undefined;
  const sid = cookies?.[SESSION_COOKIE];
  if (sid) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, sid));
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
