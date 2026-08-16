import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const actorUser = ctx.actorUser ?? ctx.user;
  // All operational routers already use ctx.user.id as the data owner.
  // For an employee, expose the workspace ID only for legacy data-owner queries.
  // Keep actorUser unchanged so routers can enforce concrete channel assignments.
  const workspaceUser = ctx.workspaceId && ctx.workspaceId !== ctx.user.id
    ? { ...ctx.user, id: ctx.workspaceId }
    : ctx.user;

  return next({
    ctx: {
      ...ctx,
      actorUser,
      user: workspaceUser,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/** Workspace-wide analytics and CRM must never be exposed to channel-scoped employees. */
export const workspaceAdminProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const actorUser = opts.ctx.actorUser ?? opts.ctx.user;
    if (!actorUser || actorUser.role === "buyer" || actorUser.role === "manager") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Доступ к общим данным рабочей зоны запрещён" });
    }
    return opts.next({ ctx: opts.ctx });
  }),
);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'owner' && ctx.user.role !== 'admin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
