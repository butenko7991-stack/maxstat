import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createChannel,
  createPurchaseRecord,
  createSaleRecord,
  deleteChannel,
  deletePurchaseRecord,
  deleteSaleRecord,
  getAvailableMonths,
  getChannelById,
  getChannelsByUser,
  getFinancialSummary,
  getPurchaseRecords,
  getSaleRecords,
  updateChannel,
  updatePurchaseRecord,
  updateSaleRecord,
} from "./db";

// ─── Shared validators ────────────────────────────────────────────────────────

const paymentStatusEnum = z.enum(["paid", "unpaid", "partial"]);
const timeSlotEnum = z.enum(["утро", "обед", "вечер", "ночной топ"]);

// ─── Channels router ──────────────────────────────────────────────────────────

const channelsRouter = router({
  list: protectedProcedure.query(({ ctx }) => getChannelsByUser(ctx.user.id)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createChannel({
        userId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const channel = await getChannelById(input.id, ctx.user.id);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
      await updateChannel(input.id, ctx.user.id, {
        name: input.name,
        description: input.description,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const channel = await getChannelById(input.id, ctx.user.id);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteChannel(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── Purchases router ─────────────────────────────────────────────────────────

const purchaseInput = z.object({
  channelId: z.number().int().positive(),
  date: z.string(), // ISO date string
  admin: z.string().max(255).optional(),
  link: z.string().max(1024).optional(),
  targetChannels: z.string().optional(),
  direction: z.string().max(255).optional(),
  tariff: z.string().max(100).optional(),
  buyer: z.string().max(255).optional(),
  spm: z.string().max(100).optional(),
  cost: z.string().optional(), // decimal as string
  paymentStatus: paymentStatusEnum.optional(),
  botStories: z.string().max(255).optional(),
  botStoriesCost: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().optional(),
});

const purchasesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        channelId: z.number().int().positive().optional(),
        month: z.string().optional(),
        paymentStatus: z.string().optional(),
      })
    )
    .query(({ ctx, input }) =>
      getPurchaseRecords(ctx.user.id, {
        channelId: input.channelId,
        month: input.month,
        paymentStatus: input.paymentStatus,
      })
    ),

  create: protectedProcedure.input(purchaseInput).mutation(async ({ ctx, input }) => {
    const id = await createPurchaseRecord({
      userId: ctx.user.id,
      channelId: input.channelId,
      date: new Date(input.date),
      admin: input.admin ?? null,
      link: input.link ?? null,
      targetChannels: input.targetChannels ?? null,
      direction: input.direction ?? null,
      tariff: input.tariff ?? null,
      buyer: input.buyer ?? null,
      spm: input.spm ?? null,
      cost: input.cost ?? null,
      paymentStatus: input.paymentStatus ?? "unpaid",
      botStories: input.botStories ?? null,
      botStoriesCost: input.botStoriesCost ?? null,
      month: input.month,
      notes: input.notes ?? null,
    });
    return { id };
  }),

  update: protectedProcedure
    .input(purchaseInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, date, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (date) updateData.date = new Date(date);
      await updatePurchaseRecord(id, ctx.user.id, updateData as Parameters<typeof updatePurchaseRecord>[2]);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deletePurchaseRecord(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── Sales router ─────────────────────────────────────────────────────────────

const saleInput = z.object({
  channelId: z.number().int().positive(),
  date: z.string(),
  admin: z.string().max(255).optional(),
  link: z.string().max(1024).optional(),
  timeSlot: timeSlotEnum.optional(),
  tariff: z.string().max(100).optional(),
  platform: z.string().max(255).optional(),
  spm: z.string().max(100).optional(),
  cost: z.string().optional(),
  paymentStatus: paymentStatusEnum.optional(),
  botStories: z.string().max(255).optional(),
  botStoriesCost: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().optional(),
});

const salesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        channelId: z.number().int().positive().optional(),
        month: z.string().optional(),
        paymentStatus: z.string().optional(),
      })
    )
    .query(({ ctx, input }) =>
      getSaleRecords(ctx.user.id, {
        channelId: input.channelId,
        month: input.month,
        paymentStatus: input.paymentStatus,
      })
    ),

  create: protectedProcedure.input(saleInput).mutation(async ({ ctx, input }) => {
    const id = await createSaleRecord({
      userId: ctx.user.id,
      channelId: input.channelId,
      date: new Date(input.date),
      admin: input.admin ?? null,
      link: input.link ?? null,
      timeSlot: input.timeSlot ?? null,
      tariff: input.tariff ?? null,
      platform: input.platform ?? null,
      spm: input.spm ?? null,
      cost: input.cost ?? null,
      paymentStatus: input.paymentStatus ?? "unpaid",
      botStories: input.botStories ?? null,
      botStoriesCost: input.botStoriesCost ?? null,
      month: input.month,
      notes: input.notes ?? null,
    });
    return { id };
  }),

  update: protectedProcedure
    .input(saleInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, date, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (date) updateData.date = new Date(date);
      await updateSaleRecord(id, ctx.user.id, updateData as Parameters<typeof updateSaleRecord>[2]);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSaleRecord(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── Summary router ───────────────────────────────────────────────────────────

const summaryRouter = router({
  financial: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(({ ctx, input }) => getFinancialSummary(ctx.user.id, input.month)),

  months: protectedProcedure.query(({ ctx }) => getAvailableMonths(ctx.user.id)),
});

// ─── App router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  channels: channelsRouter,
  purchases: purchasesRouter,
  sales: salesRouter,
  summary: summaryRouter,
});

export type AppRouter = typeof appRouter;
