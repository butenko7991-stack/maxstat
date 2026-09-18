import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  acceptWorkspaceInvitation: vi.fn(),
  getActiveWorkspaceInvitation: vi.fn(),
  getUserByEmail: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("./_core/localAuth", () => ({
  createSessionToken: vi.fn().mockResolvedValue("session-token"),
  hashPassword: vi.fn().mockResolvedValue("password-hash"),
  verifyPassword: vi.fn(),
}));

import { acceptWorkspaceInvitation, getActiveWorkspaceInvitation } from "./db";
import { registerLocalAuthRoutes } from "./_core/localAuthRoutes";

type TestResponse = { status: number; body: unknown };

async function postInvitation(path: string, body: unknown): Promise<TestResponse> {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Тестовый сервер не запущен");
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("регистрация по ссылке-приглашению", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveWorkspaceInvitation).mockResolvedValue({
      id: 7,
      role: "manager",
      workspaceId: 1,
      expiresAt: new Date("2026-09-25T00:00:00.000Z"),
    });
    vi.mocked(acceptWorkspaceInvitation).mockResolvedValue({ openId: "new-member" });
  });

  afterEach(() => vi.restoreAllMocks());

  it("предпросмотр не раскрывает legacy-email приглашения", async () => {
    vi.mocked(getActiveWorkspaceInvitation).mockResolvedValue({
      id: 7,
      email: "legacy-member@example.com",
      role: "manager",
      workspaceId: 1,
      expiresAt: new Date("2026-09-25T00:00:00.000Z"),
    });

    const result = await postInvitation("/api/auth/invitation/preview", { token: "a".repeat(43) });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ role: "manager" });
    expect(result.body).not.toHaveProperty("email");
  });

  it("требует email, который вводит сам сотрудник", async () => {
    const result = await postInvitation("/api/auth/invitation/accept", {
      token: "a".repeat(43),
      name: "Анна",
      password: "secure-pass",
    });

    expect(result.status).toBe(400);
    expect(acceptWorkspaceInvitation).not.toHaveBeenCalled();
  });

  it("нормализует самостоятельно введённый email перед созданием доступа", async () => {
    const result = await postInvitation("/api/auth/invitation/accept", {
      token: "a".repeat(43),
      name: "Анна",
      email: "  Anna.Manager@Example.COM ",
      password: "secure-pass",
    });

    expect(result.status).toBe(201);
    expect(result.body).toEqual({ success: true });
    expect(acceptWorkspaceInvitation).toHaveBeenCalledWith(expect.objectContaining({
      email: "anna.manager@example.com",
      name: "Анна",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it("не создаёт второй доступ для уже зарегистрированного email", async () => {
    vi.mocked(acceptWorkspaceInvitation).mockRejectedValue(new Error("EMAIL_ALREADY_REGISTERED"));

    const result = await postInvitation("/api/auth/invitation/accept", {
      token: "a".repeat(43),
      name: "Анна",
      email: "anna@example.com",
      password: "secure-pass",
    });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: expect.stringContaining("уже существует") });
  });
});
