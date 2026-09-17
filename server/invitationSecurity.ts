import { createHash, randomBytes } from "node:crypto";

export const INVITATION_EXPIRY_DAYS = 7;
export const invitationRoles = ["admin", "buyer", "manager"] as const;
export type InvitationRole = (typeof invitationRoles)[number];

export function getAllowedInvitationRoles(inviterRole: string): InvitationRole[] {
  if (inviterRole === "owner") return ["admin"];
  if (inviterRole === "admin") return ["buyer", "manager"];
  return [];
}

export function canCreateInvitation(inviterRole: string, invitedRole: InvitationRole): boolean {
  return getAllowedInvitationRoles(inviterRole).includes(invitedRole);
}

/** A 256-bit random token. It is sent only once to the inviter and stored only as a hash. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getInvitationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}
