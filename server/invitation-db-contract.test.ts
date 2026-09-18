import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

describe("контракт принятия role-only приглашения", () => {
  it("не принимает email при создании ссылки и не выводит его в списке", () => {
    const createBlock = dbSource.slice(
      dbSource.indexOf("export async function createWorkspaceInvitation"),
      dbSource.indexOf("export async function listWorkspaceInvitations"),
    );
    const listBlock = dbSource.slice(
      dbSource.indexOf("export async function listWorkspaceInvitations"),
      dbSource.indexOf("export async function revokeWorkspaceInvitation"),
    );

    expect(createBlock).not.toContain("email:");
    expect(listBlock).not.toContain("email: workspaceInvitations.email");
  });

  it("сверяет введённый email до расходования ссылки и сохраняет его в новом аккаунте", () => {
    const acceptBlock = dbSource.slice(
      dbSource.indexOf("export async function acceptWorkspaceInvitation"),
      dbSource.indexOf("export async function getWorkspaceUsers"),
    );

    const duplicateCheck = acceptBlock.indexOf("eq(users.email, data.email)");
    const consumeInvitation = acceptBlock.indexOf("set({ acceptedAt: now })");
    expect(duplicateCheck).toBeGreaterThan(-1);
    expect(consumeInvitation).toBeGreaterThan(duplicateCheck);
    expect(acceptBlock).toContain("email: data.email");
    expect(acceptBlock).not.toContain("email: invitation.email");
  });
});
