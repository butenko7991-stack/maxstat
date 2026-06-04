import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "./_core/localAuth";

// Set required env for JWT signing
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-32chars";
process.env.VITE_APP_ID = "test-app-id";

describe("localAuth - password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const password = "MySecurePassword123";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(20);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });
});

describe("localAuth - JWT session tokens", () => {
  it("creates and verifies a session token", async () => {
    const openId = "user-open-id-abc123";
    const token = await createSessionToken(openId);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const result = await verifySessionToken(token);
    expect(result).toBe(openId);
  });

  it("returns null for invalid token", async () => {
    const result = await verifySessionToken("invalid.token.here");
    expect(result).toBeNull();
  });

  it("returns null for empty/undefined token", async () => {
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});
