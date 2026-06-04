/**
 * REST routes for local (email/password) authentication.
 * POST /api/auth/register  — create new account
 * POST /api/auth/login     — sign in
 * POST /api/auth/logout    — clear session cookie
 */
import { randomUUID } from "crypto";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import {
  createLocalUser,
  getUserByEmail,
  getUserByOpenId,
  upsertUser,
} from "../db";
import { getSessionCookieOptions } from "./cookies";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
} from "./localAuth";
import { ENV } from "./env";

export function registerLocalAuthRoutes(app: Express) {
  // ── Register ─────────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { name, email, password } = req.body ?? {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({ error: "name, email and password are required" });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      res.status(400).json({ error: "Name must be at least 2 characters" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await getUserByEmail(trimmedEmail);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const openId = randomUUID();
    const passwordHash = await hashPassword(password);

    // First user becomes admin automatically
    const allUsers = await getUserByOpenId(ENV.ownerOpenId).catch(() => null);
    const isFirstUser = !allUsers;

    await createLocalUser({
      openId,
      name: trimmedName,
      email: trimmedEmail,
      passwordHash,
      role: isFirstUser ? "admin" : "user",
    });

    const token = await createSessionToken(openId);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ success: true });
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(trimmedEmail);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await upsertUser({ openId: user.openId, lastSignedIn: new Date() });

    const token = await createSessionToken(user.openId);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ success: true });
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
}
