/**
 * REST routes for local (email/password) authentication.
 * POST /api/auth/register  — create new account
 * POST /api/auth/login     — sign in
 * POST /api/auth/logout    — clear session cookie
 */
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import {
  getUserByEmail,
  upsertUser,
} from "../db";
import { getSessionCookieOptions } from "./cookies";
import {
  createSessionToken,
  verifyPassword,
} from "./localAuth";

export function registerLocalAuthRoutes(app: Express) {
  // ── Register ─────────────────────────────────────────────────────────────
  app.post("/api/auth/register", (_req: Request, res: Response) => {
    res.status(403).json({
      error: "Регистрация доступна только через администратора рабочей зоны",
    });
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
