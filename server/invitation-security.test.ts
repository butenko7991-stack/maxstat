import { describe, expect, it } from "vitest";
import {
  canCreateInvitation,
  generateInvitationToken,
  hashInvitationToken,
  normalizeInvitationEmail,
} from "./invitationSecurity";

describe("безопасность приглашений сотрудников", () => {
  it("разрешает владельцу приглашать только независимого администратора", () => {
    expect(canCreateInvitation("owner", "admin")).toBe(true);
    expect(canCreateInvitation("owner", "manager")).toBe(false);
    expect(canCreateInvitation("owner", "buyer")).toBe(false);
  });

  it("разрешает админу приглашать только сотрудников своей команды", () => {
    expect(canCreateInvitation("admin", "buyer")).toBe(true);
    expect(canCreateInvitation("admin", "manager")).toBe(true);
    expect(canCreateInvitation("admin", "admin")).toBe(false);
    expect(canCreateInvitation("manager", "buyer")).toBe(false);
  });

  it("выпускает непредсказуемый токен и хранит безопасный SHA-256-хэш", () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();
    expect(first).not.toBe(second);
    expect(first).toHaveLength(43);
    expect(hashInvitationToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(first)).not.toContain(first);
  });

  it("нормализует email, который сотрудник вводит при регистрации", () => {
    expect(normalizeInvitationEmail("  Team.Member@Example.COM ")).toBe("team.member@example.com");
  });
});
