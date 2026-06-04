/**
 * Local authentication — email/password, JWT session cookie.
 * Completely independent of Manus OAuth.
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import * as db from "../db";
import type { User } from "../../drizzle/schema";

const SALT_ROUNDS = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSecretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Creates a signed JWT session token for the given user id. */
export async function createSessionToken(userId: string): Promise<string> {
  const expiresAt = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt)
    .sign(getSecretKey());
}

/** Verifies the session cookie and returns the openId (sub), or null. */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const sub = payload.sub;
    return typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

/** Reads the session cookie from the request and returns the authenticated User, or null. */
export async function authenticateRequest(req: Request): Promise<User | null> {
  const raw = req.headers.cookie ?? "";
  const cookies = Object.fromEntries(
    raw.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
  const token = cookies[COOKIE_NAME];
  const openId = await verifySessionToken(token);
  if (!openId) return null;
  const user = await db.getUserByOpenId(openId);
  return user ?? null;
}
