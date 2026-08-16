import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequest } from "./localAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** Real authenticated person. Never replace this user when accessing a team workspace. */
  actorUser: User | null;
  user: User | null;
  /** Workspace that contains the user's operational data. Admins own their own workspace. */
  workspaceId?: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await authenticateRequest(opts.req);
  const workspaceId = user
    ? (user.role === "owner" || user.role === "admin" ? user.id : user.teamOwnerId ?? user.id)
    : null;

  return {
    req: opts.req,
    res: opts.res,
    actorUser: user,
    user,
    workspaceId,
  };
}
