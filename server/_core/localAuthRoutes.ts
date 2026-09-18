/**
 * REST routes for local (email/password) authentication.
 * POST /api/auth/register  — create new account
 * POST /api/auth/login     — sign in
 * POST /api/auth/logout    — clear session cookie
 */
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import {
  acceptWorkspaceInvitation,
  getActiveWorkspaceInvitation,
  getUserByEmail,
  upsertUser,
} from "../db";
import { getSessionCookieOptions } from "./cookies";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
} from "./localAuth";
import { hashInvitationToken, normalizeInvitationEmail } from "../invitationSecurity";

const invitationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerLocalAuthRoutes(app: Express) {
  // ── Register ─────────────────────────────────────────────────────────────
  app.post("/api/auth/register", (_req: Request, res: Response) => {
    res.status(403).json({
      error: "Регистрация доступна только через администратора рабочей зоны",
    });
  });

  // ── Invitation preview ───────────────────────────────────────────────────
  // The token is read from the URL fragment by the client and sent in the body,
  // so it is not written to web-server logs or Referer headers.
  app.post("/api/auth/invitation/preview", async (req: Request, res: Response) => {
    const token = req.body?.token;
    if (typeof token !== "string" || token.length < 32) {
      res.status(400).json({ error: "Некорректная ссылка-приглашение" });
      return;
    }
    const invitation = await getActiveWorkspaceInvitation(hashInvitationToken(token));
    if (!invitation) {
      res.status(404).json({ error: "Приглашение не найдено, уже использовано или срок его действия истёк" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ role: invitation.role, expiresAt: invitation.expiresAt });
  });

  // ── Accept invitation ────────────────────────────────────────────────────
  app.post("/api/auth/invitation/accept", async (req: Request, res: Response) => {
    const { token, name, email, password } = req.body ?? {};
    const normalizedEmail = typeof email === "string" ? normalizeInvitationEmail(email) : "";
    if (
      typeof token !== "string" || token.length < 32 ||
      typeof name !== "string" || name.trim().length < 2 || name.trim().length > 255 ||
      normalizedEmail.length > 320 || !invitationEmailPattern.test(normalizedEmail) ||
      typeof password !== "string" || password.length < 8 || password.length > 128
    ) {
      res.status(400).json({ error: "Проверьте email, имя и пароль: пароль должен содержать не менее 8 символов" });
      return;
    }
    try {
      const accepted = await acceptWorkspaceInvitation({
        tokenHash: hashInvitationToken(token),
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
      });
      if (!accepted) {
        res.status(410).json({ error: "Приглашение уже использовано, отозвано или срок его действия истёк" });
        return;
      }
      const sessionToken = await createSessionToken(accepted.openId);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED") {
        res.status(409).json({ error: "Для этого email уже существует учётная запись. Войдите в приложение обычным способом." });
        return;
      }
      console.error("[Invitation] Failed to accept invitation", error);
      res.status(500).json({ error: "Не удалось завершить регистрацию. Попробуйте ещё раз." });
    }
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
