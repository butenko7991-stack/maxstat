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
  countChannelRecords,
  deleteChannel,
  deletePurchaseRecord,
  deleteSaleRecord,
  getAvailableMonths,
  getChannelById,
  getChannelsByUser,
  getFinancialSummary,
  getPurchaseById,
  getPurchaseRecords,
  getSaleById,
  getSaleRecords,
  updateChannel,
  updatePurchaseRecord,
  updateSaleRecord,
  getMonthlyStats,
  getUnpaidDebts,
  getAutocompleteSuggestions,
  getScheduleData,
  checkBookingConflict,
  getChannelProfitability,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getChannelAssignments,
  getUserAssignments,
  setUserChannelAssignments,
  deleteChannelAssignment,
  getAssignedChannelIds,
  getAllChannels,
  getMutualDeals,
  getMutualDealById,
  createMutualDeal,
  updateMutualDeal,
  deleteMutualDeal,
  createMutualDealWithRecords,
  updateMutualDealWithRecords,
  deleteMutualDealWithRecords,
  calcRecommendedDoplate,
  listSubscriberSnapshots,
  upsertSubscriberSnapshot,
  deleteSubscriberSnapshot,
  getCpfAnalytics,
  getSourceEfficiency,
  getAiContext,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
  upsertPostAnalytics,
  getPostAnalyticsByRecord,
  getPostAnalyticsByUser,
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  setClientChannels,
  autoImportClients,
  getClientStats,
  getClientPurchases,
  getClientSales,
  getClientAttributedCpf,
  getExternalSalesAnalytics,
  getDb,
} from "./db";
import { sql, and, eq } from "drizzle-orm";
import { saleRecords, purchaseRecords as purchaseRecordsTable } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

// ─── Shared validators ────────────────────────────────────────────────────────
const paymentStatusEnum = z.enum(["paid", "unpaid", "partial"]);
const timeSlotEnum = z.string().max(100);

// ─── Channels router ──────────────────────────────────────────────────────────
const channelsRouter = router({
  list: protectedProcedure.query(({ ctx }) => getChannelsByUser(ctx.user.id)),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(255), description: z.string().optional() }))
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
        description: z.string().optional(),
        isVisible: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await updateChannel(id, ctx.user.id, rest);
      return { success: true };
    }),
  setVisibility: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), isVisible: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateChannel(input.id, ctx.user.id, { isVisible: input.isVisible });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.force) {
        const counts = await countChannelRecords(input.id, ctx.user.id);
        if (counts.purchases > 0 || counts.sales > 0) {
          // Encode counts in message as JSON so frontend can parse them
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: JSON.stringify({ type: 'CHANNEL_HAS_RECORDS', purchases: counts.purchases, sales: counts.sales }),
          });
        }
      }
      await deleteChannel(input.id, ctx.user.id);
      return { success: true };
    }),
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const channel = await getChannelById(input.id, ctx.user.id);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
      return channel;
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
  reach: z.number().int().nonnegative().optional(), // audience reach for SPM calculation
  cost: z.string().optional(), // decimal as string
  paymentStatus: paymentStatusEnum.optional(),
  subscribersGained: z.number().int().nonnegative().optional(), // actual subscribers gained
  month: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().optional(),
  timeSlot: timeSlotEnum.optional(),
  bookingSlot: z.enum(["утро", "обед", "вечер", "ночной топ"]).optional(),
  sourceSubscribers: z.number().int().nonnegative().optional(),
  isMutual: z.boolean().optional(),
  partnerChannel: z.string().max(255).optional(),
  ourReach: z.number().int().nonnegative().optional(),
  partnerReach: z.number().int().nonnegative().optional(),
  dopDirection: z.enum(["we_pay", "they_pay", "none"]).optional(),
  dopAmount: z.string().optional(),
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
      reach: input.reach ?? null,
      cost: input.cost ?? null,
      paymentStatus: input.paymentStatus ?? "unpaid",
      subscribersGained: input.subscribersGained ?? null,
      month: input.month,
      notes: input.notes ?? null,
      timeSlot: input.timeSlot ?? null,
      bookingSlot: input.bookingSlot ?? deriveBookingSlot(input.timeSlot),
      sourceSubscribers: input.sourceSubscribers ?? null,
      isMutual: input.isMutual ?? false,
      partnerChannel: input.partnerChannel ?? null,
      ourReach: input.ourReach ?? null,
      partnerReach: input.partnerReach ?? null,
      dopDirection: input.dopDirection ?? "none",
      dopAmount: input.dopAmount ?? null,
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
  quickUpdatePayment: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), paymentStatus: paymentStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      await updatePurchaseRecord(input.id, ctx.user.id, { paymentStatus: input.paymentStatus });
      // Auto-fetch analytics when status changes to paid and record has a link
      if (input.paymentStatus === "paid") {
        const record = await getPurchaseById(input.id, ctx.user.id);
        if (record?.link) {
          upsertPostAnalytics(ctx.user.id, "purchase", input.id, record.link).catch(() => {});
        }
      }
      return { success: true };
    }),
  duplicate: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const original = await getPurchaseById(input.id, ctx.user.id);
      if (!original) throw new TRPCError({ code: "NOT_FOUND" });
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = original;
      const newId = await createPurchaseRecord({ ...rest });
      return { id: newId };
    }),
   exportData: protectedProcedure
    .input(
      z.object({
        month: z.string().optional(),
        channelId: z.number().int().positive().optional(),
      })
    )
    .query(({ ctx, input }) =>
      getPurchaseRecords(ctx.user.id, { month: input.month, channelId: input.channelId })
    ),
  bulkCreate: protectedProcedure
    .input(z.object({
      slots: z.array(z.object({
        channelId: z.number().int().positive(),
        date: z.string(),
        bookingSlot: z.enum(["утро", "обед", "вечер", "ночной топ"]).optional(),
        timeSlot: timeSlotEnum.optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
      })),
      admin: z.string().max(255).optional(),
      link: z.string().max(1024).optional(),
      targetChannels: z.string().optional(),
      direction: z.string().max(255).optional(),
      tariff: z.string().max(100).optional(),
      buyer: z.string().max(255).optional(),
      spm: z.string().max(100).optional(),
      reach: z.number().int().nonnegative().optional(),
      cost: z.string().optional(),
      paymentStatus: paymentStatusEnum.optional(),
      subscribersGained: z.number().int().nonnegative().optional(),
      sourceSubscribers: z.number().int().nonnegative().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conflicts: string[] = [];
      for (const slot of input.slots) {
        if (slot.bookingSlot) {
          const dateStr = slot.date.slice(0, 10);
          const conflict = await checkBookingConflict(ctx.user.id, slot.channelId, dateStr, slot.bookingSlot);
          if (conflict) {
            conflicts.push(`Канал ${slot.channelId} / ${slot.date} / ${slot.bookingSlot} уже занят (#${conflict})`);
          }
        }
      }
      if (conflicts.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Конфликт: " + conflicts.join("; ") });
      }
      const ids: number[] = [];
      for (const slot of input.slots) {
        const id = await createPurchaseRecord({
          userId: ctx.user.id,
          channelId: slot.channelId,
          date: new Date(slot.date),
          admin: input.admin ?? null,
          link: input.link ?? null,
          targetChannels: input.targetChannels ?? null,
          direction: input.direction ?? null,
          tariff: input.tariff ?? null,
          buyer: input.buyer ?? null,
          spm: input.spm ?? null,
          reach: input.reach ?? null,
          cost: input.cost ?? null,
          paymentStatus: input.paymentStatus ?? "unpaid",
          subscribersGained: input.subscribersGained ?? null,
          month: slot.month,
          notes: input.notes ?? null,
          timeSlot: slot.timeSlot ?? null,
          bookingSlot: slot.bookingSlot ?? deriveBookingSlot(slot.timeSlot),
          sourceSubscribers: input.sourceSubscribers ?? null,
        });
        ids.push(id);
      }
      return { ids, count: ids.length };
    }),
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const record = await getPurchaseById(input.id, ctx.user.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      return record;
    }),
  /** Find related sale + purchase records by admin name for ВП auto-linking */
  findLinkedByAdmin: protectedProcedure
    .input(z.object({ admin: z.string().min(1), excludeId: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { sales: [], purchases: [] };
      const adminLike = `%${input.admin.trim()}%`;
      const [sales, purchases] = await Promise.all([
        db.select({
          id: saleRecords.id,
          admin: saleRecords.admin,
          date: saleRecords.date,
          channelId: saleRecords.channelId,
          cost: saleRecords.cost,
          isMutual: saleRecords.isMutual,
          month: saleRecords.month,
        }).from(saleRecords)
          .where(and(
            eq(saleRecords.userId, ctx.user.id),
            sql`${saleRecords.admin} LIKE ${adminLike}`
          ))
          .orderBy(sql`${saleRecords.date} DESC`)
          .limit(10),
        db.select({
          id: purchaseRecordsTable.id,
          admin: purchaseRecordsTable.admin,
          date: purchaseRecordsTable.date,
          channelId: purchaseRecordsTable.channelId,
          cost: purchaseRecordsTable.cost,
          isMutual: purchaseRecordsTable.isMutual,
          month: purchaseRecordsTable.month,
        }).from(purchaseRecordsTable)
          .where(and(
            eq(purchaseRecordsTable.userId, ctx.user.id),
            sql`${purchaseRecordsTable.admin} LIKE ${adminLike}`,
            input.excludeId ? sql`${purchaseRecordsTable.id} != ${input.excludeId}` : sql`1=1`
          ))
          .orderBy(sql`${purchaseRecordsTable.date} DESC`)
          .limit(10),
      ]);
      return { sales, purchases };
    }),
});
// ─── Sales router ─────────────────────────────────────────────────────────────

/** Derive a bookingSlot from a free-text timeSlot string.
 * Maps time values to утро/обед/вечер based on hour of day.
 * Also handles direct text values like "утро", "обед", "вечер".
 */
function deriveBookingSlot(timeSlot: string | undefined | null): "утро" | "обед" | "вечер" | "ночной топ" | null {
  if (!timeSlot) return null;
  const lower = timeSlot.toLowerCase().trim();
  if (lower === "утро" || lower === "утром") return "утро";
  if (lower === "обед" || lower === "днём" || lower === "день") return "обед";
  if (lower === "вечер" || lower === "вечером") return "вечер";
  if (lower === "ночной топ" || lower === "ночь" || lower === "ночью") return "ночной топ";
  // Try to parse HH:MM or HH.MM format
  const match = lower.match(/^(\d{1,2})[:\.](\d{2})/);
  if (match) {
    const hour = parseInt(match[1], 10);
    if (hour < 12) return "утро";
    if (hour < 17) return "обед";
    if (hour < 22) return "вечер";
    return "ночной топ";
  }
  return null;
}

const saleInput = z.object({
  channelId: z.number().int().positive(),
  date: z.string(),
  admin: z.string().max(255).optional(),
  link: z.string().max(1024).optional(),
  timeSlot: timeSlotEnum.optional(),
  tariff: z.string().max(100).optional(),
  platform: z.string().max(255).optional(),
  spm: z.string().max(100).optional(),
  reach: z.number().int().nonnegative().optional(), // audience reach for SPM calculation
  cost: z.string().optional(),
  paymentStatus: paymentStatusEnum.optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  bookingSlot: z.enum(["утро", "обед", "вечер", "ночной топ"]).optional(),
  notes: z.string().optional(),
  postNotNeeded: z.boolean().optional(),
  buyerSubscribers: z.number().int().nonnegative().optional(),
  // External advertiser flag
  isExternal: z.boolean().optional(),
  // ВП fields
  isMutual: z.boolean().optional(),
  partnerChannel: z.string().max(255).optional(),
  ourReach: z.number().int().nonnegative().optional(),
  partnerReach: z.number().int().nonnegative().optional(),
  dopDirection: z.enum(["we_pay", "they_pay", "none"]).optional(),
  dopAmount: z.string().optional(),
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
    // Check booking conflict if bookingSlot is specified
    if (input.bookingSlot) {
      const dateStr = input.date.slice(0, 10);
      const conflict = await checkBookingConflict(ctx.user.id, input.channelId, dateStr, input.bookingSlot);
      if (conflict) {
        throw new TRPCError({ code: "CONFLICT", message: `Слот уже занят (запись #${conflict})` });
      }
    }
    const id = await createSaleRecord({
      userId: ctx.user.id,
      channelId: input.channelId,
      date: new Date(input.date),
      admin: input.admin ?? null,
      link: input.link ?? null,
      timeSlot: input.timeSlot ?? null,
      bookingSlot: input.bookingSlot ?? deriveBookingSlot(input.timeSlot),
      tariff: input.tariff ?? null,
      platform: input.platform ?? null,
      spm: input.spm ?? null,
      reach: input.reach ?? null,
      cost: input.cost ?? null,
      paymentStatus: input.paymentStatus ?? "unpaid",
      month: input.month,
      postNotNeeded: input.postNotNeeded ?? false,
      isExternal: input.isExternal ?? false,
      isMutual: input.isMutual ?? false,
      partnerChannel: input.partnerChannel ?? null,
      ourReach: input.ourReach ?? null,
      partnerReach: input.partnerReach ?? null,
      dopDirection: input.dopDirection ?? "none",
      dopAmount: input.dopAmount ?? null,
      buyerSubscribers: input.buyerSubscribers ?? null,
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
      // Auto-derive bookingSlot from timeSlot if bookingSlot is not explicitly set
      if (!input.bookingSlot && input.timeSlot) {
        const derived = deriveBookingSlot(input.timeSlot);
        if (derived) updateData.bookingSlot = derived;
      }
      // Check booking conflict if bookingSlot is being updated
      if (input.bookingSlot && input.channelId && input.date) {
        const dateStr = input.date.slice(0, 10);
        const conflict = await checkBookingConflict(ctx.user.id, input.channelId, dateStr, input.bookingSlot, id);
        if (conflict) {
          throw new TRPCError({ code: "CONFLICT", message: `Слот "${input.bookingSlot}" уже занят для этого канала на выбранную дату.` });
        }
      }
      await updateSaleRecord(id, ctx.user.id, updateData as Parameters<typeof updateSaleRecord>[2]);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSaleRecord(input.id, ctx.user.id);
      return { success: true };
    }),
  quickUpdatePayment: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), paymentStatus: paymentStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      await updateSaleRecord(input.id, ctx.user.id, { paymentStatus: input.paymentStatus });
      // Auto-fetch analytics when status changes to paid and record has a link
      if (input.paymentStatus === "paid") {
        const record = await getSaleById(input.id, ctx.user.id);
        if (record?.link) {
          upsertPostAnalytics(ctx.user.id, "sale", input.id, record.link).catch(() => {});
        }
      }
      return { success: true };
    }),
  duplicate: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const original = await getSaleById(input.id, ctx.user.id);
      if (!original) throw new TRPCError({ code: "NOT_FOUND" });
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = original;
      const newId = await createSaleRecord({ ...rest });
      return { id: newId };
    }),
  exportData: protectedProcedure
    .input(
      z.object({
        month: z.string().optional(),
        channelId: z.number().int().positive().optional(),
      })
    )
    .query(({ ctx, input }) =>
      getSaleRecords(ctx.user.id, { month: input.month, channelId: input.channelId })
    ),
  bulkCreate: protectedProcedure
    .input(z.object({
      slots: z.array(z.object({
        channelId: z.number().int().positive(),
        date: z.string(),
        bookingSlot: z.enum(["утро", "обед", "вечер", "ночной топ"]).optional(),
        timeSlot: timeSlotEnum.optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
      })),
      // Shared fields for all slots
      admin: z.string().max(255).optional(),
      link: z.string().max(1024).optional(),
      tariff: z.string().max(100).optional(),
      platform: z.string().max(255).optional(),
      spm: z.string().max(100).optional(),
      reach: z.number().int().nonnegative().optional(),
      cost: z.string().optional(),
      paymentStatus: paymentStatusEnum.optional(),
      postNotNeeded: z.boolean().optional(),
      buyerSubscribers: z.number().int().nonnegative().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conflicts: string[] = [];
      for (const slot of input.slots) {
        if (slot.bookingSlot) {
          const dateStr = slot.date.slice(0, 10);
          const conflict = await checkBookingConflict(ctx.user.id, slot.channelId, dateStr, slot.bookingSlot);
          if (conflict) {
            conflicts.push(`Канал ${slot.channelId} / ${slot.date} / ${slot.bookingSlot} уже занят (#${conflict})`);
          }
        }
      }
      if (conflicts.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Конфликт: " + conflicts.join("; ") });
      }
      const ids: number[] = [];
      for (const slot of input.slots) {
        const id = await createSaleRecord({
          userId: ctx.user.id,
          channelId: slot.channelId,
          date: new Date(slot.date),
          admin: input.admin ?? null,
          link: input.link ?? null,
          timeSlot: slot.timeSlot ?? null,
          bookingSlot: slot.bookingSlot ?? deriveBookingSlot(slot.timeSlot),
          tariff: input.tariff ?? null,
          platform: input.platform ?? null,
          spm: input.spm ?? null,
          reach: input.reach ?? null,
          cost: input.cost ?? null,
          paymentStatus: input.paymentStatus ?? "unpaid",
          month: slot.month,
          postNotNeeded: input.postNotNeeded ?? false,
          buyerSubscribers: input.buyerSubscribers ?? null,
          notes: input.notes ?? null,
        });
        ids.push(id);
      }
      return { ids, count: ids.length };
    }),
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const record = await getSaleById(input.id, ctx.user.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      return record;
    }),
});
// ─── Summary routerr ───────────────────────────────────────────────────────────
const summaryRouter = router({
  financial: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(({ ctx, input }) => getFinancialSummary(ctx.user.id, input.month)),
  months: protectedProcedure.query(({ ctx }) => getAvailableMonths(ctx.user.id)),
  monthlyStats: protectedProcedure
    .input(z.object({ channelId: z.number().int().positive().optional() }))
    .query(({ ctx, input }) => getMonthlyStats(ctx.user.id, input.channelId)),
  unpaidDebts: protectedProcedure
    .input(z.object({
      channelId: z.number().int().positive().optional(),
      month: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const byChannel = await getUnpaidDebts(ctx.user.id, input.channelId, input.month);
      const unpaidPurchases = byChannel.reduce((s, c) => s + c.unpaidPurchases, 0);
      const unpaidSales = byChannel.reduce((s, c) => s + c.unpaidSales, 0);
      const unpaidPurchaseCount = byChannel.reduce((s, c) => s + c.unpaidPurchaseCount, 0);
      const unpaidSaleCount = byChannel.reduce((s, c) => s + c.unpaidSaleCount, 0);
      return { unpaidPurchases, unpaidSales, unpaidPurchaseCount, unpaidSaleCount, byChannel };
    }),
  autocomplete: protectedProcedure.query(({ ctx }) => getAutocompleteSuggestions(ctx.user.id)),
});
// ─── Schedule router ─────────────────────────────────────────────────────────────────────────────────────
const scheduleRouter = router({
  getData: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(({ ctx, input }) => getScheduleData(ctx.user.id, input.startDate, input.endDate)),
});
// ─── AI Analytics router ────────────────────────────────────────────────────────────────────────────────
const aiRouter = router({
  /** Get raw profitability data per channel */
  profitability: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(({ ctx, input }) => getChannelProfitability(ctx.user.id, input.month)),

  /** AI analysis of channel profitability with CPF + ER + reach business logic */
  analyzeChannels: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ctx_data = await getAiContext(ctx.user.id, input.month);
      if (ctx_data.channels.length === 0) {
        return { analysis: "Нет данных для анализа. Добавьте записи о закупах и продажах.", data: null };
      }

      const channelsSummary = ctx_data.channels.map(c => {
        const lines: string[] = [`### ${c.channelName}`];
        // Subscribers & reach
        if (c.currentSubscribers !== null) {
          const growthStr = c.weeklyGrowth != null
            ? ` (нед. прирост: ${c.weeklyGrowth >= 0 ? '+' : ''}${c.weeklyGrowth})`
            : '';
          lines.push(`- 👥 Подписчики: ${c.currentSubscribers.toLocaleString('ru-RU')}${growthStr}`);
        }
        if (c.er24 !== null) {
          lines.push(`- 📊 ER24: ${c.er24.toFixed(2)}% | Охваты: 24ч=${c.views24h ?? '—'}, 48ч=${c.views48h ?? '—'}, 72ч=${c.views72h ?? '—'}`);
        }
        // CPF & subscriber acquisition
        if (c.avgCpf !== null || c.subscribersGained > 0) {
          lines.push(`- 🎯 Привлечено подписчиков: ${c.subscribersGained > 0 ? '+' + c.subscribersGained.toLocaleString('ru-RU') : '—'} | Ср. CPF: ${c.avgCpf !== null ? c.avgCpf + '₽' : '—'}`);
        }
        // Financial
        lines.push(`- 💰 Доход: ${c.salesTotal.toLocaleString('ru-RU')}₽ (${c.salesCount} продаж) | Реальный расход: ${(c as any).realPurchasesTotal.toLocaleString('ru-RU')}₽ (${c.purchasesCount} закупок)`);
        lines.push(`- 📈 Прибыль: ${c.profit.toLocaleString('ru-RU')}₽ | ROI: ${c.roi === Infinity ? '∞' : c.roi.toFixed(0)}%`);
        if ((c as any).savedByVp > 0) lines.push(`- 🎁 Сэкономлено через ВП: ${(c as any).savedByVp.toLocaleString('ru-RU')}₽ (рыночная стоимость ${(c as any).mutualPurchasesCount} закупок)`);
        // Unpaid
        if (c.unpaidSalesTotal > 0 || c.unpaidPurchasesTotal > 0) {
          lines.push(`- ⚠️ Неоплачено: продажи ${c.unpaidSalesTotal.toLocaleString('ru-RU')}₽, закупки ${c.unpaidPurchasesTotal.toLocaleString('ru-RU')}₽`);
        }
        // Purchase details
        if (c.topDirections.length > 0) lines.push(`- 🏷️ Ниши закупа: ${c.topDirections.slice(0, 5).join(', ')}`);
        if (c.topTariffs.length > 0) lines.push(`- ⏱️ Тарифы: ${c.topTariffs.slice(0, 4).join(', ')}`);
        if (c.avgPurchaseReach !== null) lines.push(`- 👁️ Ср. охват закупа: ${c.avgPurchaseReach.toLocaleString('ru-RU')}`);
        if (c.avgSpm !== null) lines.push(`- 💲 Ср. СПМ закупа: ${c.avgSpm}₽`);
        if (c.avgSourceSubscribers !== null) lines.push(`- 📡 Ср. размер канала-источника: ${c.avgSourceSubscribers.toLocaleString('ru-RU')}`);
        // Sale details
        if (c.platforms.length > 0) lines.push(`- 📱 Платформы продаж: ${c.platforms.join(', ')}`);
        if (c.avgSaleReach !== null) lines.push(`- 👁️ Ср. охват продажи: ${c.avgSaleReach.toLocaleString('ru-RU')}`);
        if (c.avgBuyerSubscribers !== null) lines.push(`- 🛒 Ср. размер канала-покупателя: ${c.avgBuyerSubscribers.toLocaleString('ru-RU')}`);
        if (c.mutualSalesCount > 0) lines.push(`- 🤝 ВП-продажи: ${c.mutualSalesCount} шт. на ${c.mutualSalesRevenue.toLocaleString('ru-RU')}₽`);
        if (c.mutualPurchasesCount > 0) lines.push(`- 🤝 ВП-закупки: ${c.mutualPurchasesCount} шт. (в расходы НЕ входят, рыночная стоимость: ${(c as any).mutualPurchasesTotal.toLocaleString('ru-RU')}₽)`);
        return lines.join('\n');
      }).join('\n\n');

      // Pre-compute expense lines to avoid nested template literals
      const avgCpfLine = ctx_data.overallAvgCpf !== null ? `- Средний CPF: ${ctx_data.overallAvgCpf}₽` : '';
      const expensesLine = ctx_data.totalExpenses > 0
        ? `- Операционные расходы: ${ctx_data.totalExpenses.toLocaleString('ru-RU')}₽ (${Object.entries(ctx_data.expensesByCategory).map(([k, v]) => k + ': ' + (v as number).toLocaleString('ru-RU') + '₽').join(', ')})`
        : '';
      const netProfitLine = ctx_data.totalExpenses > 0
        ? `- Чистая прибыль: ${ctx_data.netProfit.toLocaleString('ru-RU')}₽`
        : '';
      const mutualBlock = ctx_data.mutual.total > 0 ? `
ВЗАИМКИ (ВП):
- Всего сделок: ${ctx_data.mutual.total} (завершено: ${ctx_data.mutual.completed}, активных: ${ctx_data.mutual.active})
- Доплатили партнёрам: ${ctx_data.mutual.totalDopPaid.toLocaleString('ru-RU')}₽
- Получили доплату: ${ctx_data.mutual.totalDopReceived.toLocaleString('ru-RU')}₽
${ctx_data.mutual.avgOurReach !== null ? `- Ср. наш охват в ВП: ${ctx_data.mutual.avgOurReach.toLocaleString('ru-RU')}` : ''}
${ctx_data.mutual.avgPartnerReach !== null ? `- Ср. охват партнёра: ${ctx_data.mutual.avgPartnerReach.toLocaleString('ru-RU')}` : ''}` : '';

      // Fetch post analytics for context
      const allPostAnalytics = await getPostAnalyticsByUser(ctx.user.id);
      const postAnalyticsLines = allPostAnalytics.slice(0, 20).map(pa => {
        const channels_data = (() => { try { return JSON.parse(pa.channelsJson ?? '[]'); } catch { return []; } })();
        const chList = channels_data
          .map((ch: { channelTitle: string; currentViews: number; err24h: number | null }) => {
            const errStr = ch.err24h != null ? ` ERR=${ch.err24h.toFixed(1)}%` : '';
            return `${ch.channelTitle}: ${ch.currentViews} просм.${errStr}`;
          })
          .join(', ');
        const recordLabel = pa.recordType === 'sale' ? 'Продажа' : 'Закуп';
        const err24Str = pa.err24h != null ? parseFloat(String(pa.err24h)).toFixed(1) + '%' : '—';
        const chListStr = chList ? ` | ${chList}` : '';
        return `- [${recordLabel}] ${pa.postTitle ?? 'Без названия'}: ${pa.totalViews ?? 0} просм. всего, 24ч=${pa.views24h ?? '—'}, ERR24=${err24Str}, подп.=${pa.totalSubscribers ?? '—'}${chListStr}`;
      });
      const postAnalyticsBlock = allPostAnalytics.length > 0
        ? `\nАНАЛИТИКА ПОСТОВ (из Trustat, ${allPostAnalytics.length} записей):\n${postAnalyticsLines.join('\n')}`
        : '';
      const periodLabel = input.month ? `за ${input.month}` : 'за всё время';
      const prompt = `Ты — эксперт по экономике рекламных каналов в Макс/Телеграм. Анализируй ${periodLabel}.

БИЗНЕС-МОДЕЛЬ:
Бизнес построен на закупе подписчиков (реклама в других каналах) и продаже рекламы в своих каналах.
Ключевые метрики эффективности:
- CPF (стоимость подписчика) — сколько стоит привлечь 1 подписчика. Хороший CPF: < 5₽, средний: 5–15₽, плохой: > 15₽
- ER24 (вовлечённость за 24ч) — качество аудитории. Хороший: ≥ 15%, средний: 8–15%, низкий: < 8%
- Охваты 24ч/48ч/72ч — база для расчёта СПМ (цена за 1000 просмотров)
- ROI — рентабельность. Хороший: > 50%, средний: 20–50%, плохой: < 20%
- ВП (взаимки) — бесплатный обмен аудиторией, снижает CPF

ОБЩИЕ ПОКАЗАТЕЛИ (${periodLabel}):
- Доход: ${ctx_data.totalSales.toLocaleString('ru-RU')}₽ (${ctx_data.channels.reduce((s, c) => s + c.salesCount, 0)} продаж)
- Реальный расход (без ВП): ${ctx_data.totalRealPurchases.toLocaleString('ru-RU')}₽ (${ctx_data.channels.reduce((s, c) => s + c.purchasesCount, 0)} закупок)
${ctx_data.totalSavedByVp > 0 ? `- 🎁 Сэкономлено через ВП: ${ctx_data.totalSavedByVp.toLocaleString('ru-RU')}₽ (рыночная стоимость ${ctx_data.channels.reduce((s, c) => s + (c as any).mutualPurchasesCount, 0)} ВП-закупок)` : ''}
- Прибыль (до расходов): ${ctx_data.totalProfit.toLocaleString('ru-RU')}₽ | ROI: ${ctx_data.overallROI.toFixed(1)}%
${expensesLine}
${netProfitLine}
- Подписчиков сейчас: ${ctx_data.totalCurrentSubscribers.toLocaleString('ru-RU')}
- Привлечено за период: +${ctx_data.totalSubscribersGained.toLocaleString('ru-RU')}
${avgCpfLine}
${mutualBlock}
${postAnalyticsBlock}
ПО КАНАЛАМ:
${channelsSummary}
ЗАДАНИЕ: Дай глубокий анализ на русском языке в формате markdown.
Структура ответа:
## 📊 Итоги периода
Кратко: доход, расход, прибыль, ROI — с оценкой «хорошо/есть куда расти» по бенчмарку. Если ROI > 0 — обязательно отметь это как достижение.
## 👥 Закуп: где деньги работают лучше всего
Назови 1–2 канала/ниши с лучшим CPF. Для каналов с высоким CPF — конкретный совет: снизить бюджет, сменить тариф, попробовать ВП вместо платного закупа.
## 📈 Качество аудитории
ER24 по каналам с оценкой. Если ER низкий — конкретная причина и действие (например: «попробуй нативный контент вместо рекламного, это поднимает ER на 20–40%»).
## 💰 Продажи: как заработать больше
Что продаётся лучше, какие охваты дают лучший CPM. Конкретный совет: поднять цену на X%, добавить слот, предложить пакет.
## 🤝 ВП-сделки
Если есть ВП — оцени эффективность, назови лучшие. Если мало — скажи сколько ВП в месяц стоит делать для экономии бюджета.
## 🎯 3 конкретных действия на следующую неделю
Каждое действие: ЧТО сделать + ЗАЧЕМ (ожидаемый результат в цифрах) + КАК (конкретный шаг).
Максимум 700 слов. Используй эмодзи для акцентов. Называй конкретные каналы и цифры из данных выше. Тон — как опытный наставник, который верит в успех бизнеса..`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: `Ты — опытный бизнес-наставник и аналитик рекламного бизнеса в Макс/Телеграм.
Твоя задача — помочь владельцу бизнеса расти и зарабатывать больше.

ПРАВИЛА ТОНА И СТИЛЯ:
- Пиши в мотивирующем, конструктивном тоне. Никакой «катастрофы», «провала», «ужасных» результатов.
- Любую проблему формулируй как возможность: не «плохой CPF», а «CPF можно снизить с X до Y, вот как».
- Каждый вывод должен сопровождаться конкретным действием: что именно сделать, когда, с какими числами.
- Используй реальные цифры из данных — не абстрактные оценки.
- Сравнивай с бенчмарками (CPF < 5₽ = отлично, 5–15₽ = норма, > 15₽ = есть куда расти).
- Если данных мало — скажи что именно нужно собрать, чтобы анализ был точнее.
- Никогда не пиши «данных недостаточно» без конкретного следующего шага.` },
          { role: "user", content: prompt },
        ],
      });
      const content = result.choices?.[0]?.message?.content;
      const analysis = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: { type: string; text?: string }) => p.type === "text" ? p.text : "").join("") : "";
      return { analysis, data: ctx_data };
    }),
    /** AI digest — weekly/monthly text summary */
  generateDigest: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const ctx_data = await getAiContext(ctx.user.id, input.month);
      if (ctx_data.channels.length === 0) {
        return { digest: "Нет данных для дайджеста." };
      }

      const channelsList = ctx_data.channels.map(c => {
        const parts = [
          `**${c.channelName}**: доход ${c.salesTotal.toLocaleString('ru-RU')}₽ / реальный расход ${(c as any).realPurchasesTotal.toLocaleString('ru-RU')}₽ / прибыль ${c.profit.toLocaleString('ru-RU')}₽ / ROI ${c.roi === Infinity ? '∞' : c.roi.toFixed(0)}%`,
        ];
        if (c.currentSubscribers !== null) {
          const wgStr = c.weeklyGrowth != null ? ` (${c.weeklyGrowth >= 0 ? '+' : ''}${c.weeklyGrowth} нед.)` : '';
          parts.push(`подписчики: ${c.currentSubscribers.toLocaleString('ru-RU')}${wgStr}`);
        }
        if (c.avgCpf !== null) parts.push(`CPF: ${c.avgCpf}₽`);
        if (c.er24 !== null) parts.push(`ER24: ${c.er24.toFixed(1)}%`);
        if (c.topDirections.length > 0) parts.push(`ниши: ${c.topDirections.slice(0, 3).join(', ')}`);
        if (c.mutualSalesCount > 0) parts.push(`ВП-продажи: ${c.mutualSalesCount} шт.`);
        if (c.mutualPurchasesCount > 0) parts.push(`ВП-закупки: ${c.mutualPurchasesCount} шт. (сэкономлено: ${(c as any).savedByVp.toLocaleString('ru-RU')}₽, в расходы не входят)`);
        if (c.unpaidSalesTotal > 0 || c.unpaidPurchasesTotal > 0) parts.push(`⚠️ неопл.: ${(c.unpaidSalesTotal + c.unpaidPurchasesTotal).toLocaleString('ru-RU')}₽`);
        return parts.join(' | ');
      }).join('\n');

      // Pre-compute to avoid nested template literals
      const digestExpenseLine = ctx_data.totalExpenses > 0
        ? `\n- Операц. расходы: ${ctx_data.totalExpenses.toLocaleString('ru-RU')}₽ | Чистая прибыль: ${ctx_data.netProfit.toLocaleString('ru-RU')}₽`
        : '';
      const digestCpfLine = ctx_data.overallAvgCpf !== null ? ` | Ср. CPF: ${ctx_data.overallAvgCpf}₽` : '';
      const mutualLine = ctx_data.mutual.total > 0
        ? `\nВзаимки: ${ctx_data.mutual.total} сделок (завершено: ${ctx_data.mutual.completed}), доплата нам: ${ctx_data.mutual.totalDopReceived.toLocaleString('ru-RU')}₽`
        : '';

      const periodLabel = input.month ? `за ${input.month}` : 'за всё время';
      const profitSign = ctx_data.totalProfit >= 0 ? '+' : '';
      const digestVpLine = ctx_data.totalSavedByVp > 0
        ? `\n- 🎁 Сэкономлено через ВП: ${ctx_data.totalSavedByVp.toLocaleString('ru-RU')}₽ (рыночная стоимость ВП-закупок, в расходы не входит)`
        : '';
      const prompt = `Составь мотивирующий бизнес-дайджест ${periodLabel} для владельца рекламных каналов в Макс/Телеграм. Обращайсь на «ты».

ДАННЫЕ:
- Доход: ${ctx_data.totalSales.toLocaleString('ru-RU')}₽ | Реальный расход (без ВП): ${ctx_data.totalRealPurchases.toLocaleString('ru-RU')}₽ | Прибыль: ${profitSign}${ctx_data.totalProfit.toLocaleString('ru-RU')}₽ | ROI: ${ctx_data.overallROI.toFixed(1)}%${digestExpenseLine}${digestVpLine}
- Подписчиков: ${ctx_data.totalCurrentSubscribers.toLocaleString('ru-RU')} | Привлечено: +${ctx_data.totalSubscribersGained.toLocaleString('ru-RU')}${digestCpfLine}${mutualLine}

По каналам:
${channelsList}

Напиши на русском языке живой дайджест (200–300 слов) в формате markdown. Обращайсь на «ты», говори как наставник-друг:

- 🔥 Главное за период — один абзац, энергично, с ключевыми цифрами
- 🏆 Чем можно гордиться — реальные достижения с цифрами, даже если небольшие
- 📈 Что выросло, что просело — честно, без паники
- ⚠️ На что обратить внимание — риски и точки роста как возможности
- 🎯 Три шага на следующий период — конкретные действия с ожидаемым эффектом в рублях

Стиль: живой, личный, с цифрами. Никакой корпоративной воды. Используй эмодзи для акцентов.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Ты — опытный бизнес-наставник, составляющий дайджесты для владельцев рекламного бизнеса в Макс/Телеграм. Обращайся на «ты», говори как друг-наставник: искренно радуйся успехам, честно указывай на проблемы, зажигай на действия. Любую проблему формулируй как возможность, каждое действие — с конкретными цифрами. Никакой корпоративной воды — только факты, цифры и действия." },
          { role: "user", content: prompt },
        ],
      });
      const content = result.choices?.[0]?.message?.content;
      const digest = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: { type: string; text?: string }) => p.type === "text" ? p.text : "").join("") : "";
      return { digest, data: ctx_data };
    }),

  /** Weekly performance stats — current week vs previous week */
  weeklyStats: protectedProcedure
    .input(z.object({ referenceDate: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      const now = input.referenceDate ?? new Date();
      // Get Monday of current week
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
      const curMonStart = new Date(now);
      curMonStart.setHours(0, 0, 0, 0);
      curMonStart.setDate(curMonStart.getDate() - dayOfWeek);
      const curSunEnd = new Date(curMonStart);
      curSunEnd.setDate(curSunEnd.getDate() + 6);
      curSunEnd.setHours(23, 59, 59, 999);
      // Previous week
      const prevMonStart = new Date(curMonStart);
      prevMonStart.setDate(prevMonStart.getDate() - 7);
      const prevSunEnd = new Date(curMonStart);
      prevSunEnd.setDate(prevSunEnd.getDate() - 1);
      prevSunEnd.setHours(23, 59, 59, 999);

      const toISO = (d: Date) => d.toISOString().slice(0, 10);

      const [curSched, prevSched] = await Promise.all([
        getScheduleData(ctx.user.id, toISO(curMonStart), toISO(curSunEnd)),
        getScheduleData(ctx.user.id, toISO(prevMonStart), toISO(prevSunEnd)),
      ]);

      const sumCost = (arr: Array<{ cost?: string | number | null }>) =>
        arr.reduce((s, r) => s + (parseFloat(String(r.cost ?? 0)) || 0), 0);

      const curSales = sumCost(curSched.sales);
      const curPurchases = sumCost(curSched.purchases);
      const prevSales = sumCost(prevSched.sales);
      const prevPurchases = sumCost(prevSched.purchases);

      // Expenses: use month-based data for current month (no week-level date on expenses)
      const curMonth = `${curMonStart.getFullYear()}-${String(curMonStart.getMonth() + 1).padStart(2, '0')}`;
      const prevMonth = `${prevMonStart.getFullYear()}-${String(prevMonStart.getMonth() + 1).padStart(2, '0')}`;
      const [curExpSummary, prevExpSummary] = await Promise.all([
        getExpenseSummary(ctx.user.id, curMonth),
        getExpenseSummary(ctx.user.id, prevMonth),
      ]);
      // Pro-rate monthly expenses to weekly (divide by ~4.33 weeks per month)
      const curExpenses = (curExpSummary.total ?? 0) / 4.33;
      const prevExpenses = (prevExpSummary.total ?? 0) / 4.33;

      const curProfit = curSales - curPurchases - curExpenses;
      const prevProfit = prevSales - prevPurchases - prevExpenses;

      const pct = (cur: number, prev: number) =>
        prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100);

      return {
        currentWeek: {
          start: toISO(curMonStart),
          end: toISO(curSunEnd),
          sales: Math.round(curSales),
          purchases: Math.round(curPurchases),
          expenses: Math.round(curExpenses),
          profit: Math.round(curProfit),
          salesCount: curSched.sales.length,
          purchasesCount: curSched.purchases.length,
        },
        previousWeek: {
          start: toISO(prevMonStart),
          end: toISO(prevSunEnd),
          sales: Math.round(prevSales),
          purchases: Math.round(prevPurchases),
          expenses: Math.round(prevExpenses),
          profit: Math.round(prevProfit),
          salesCount: prevSched.sales.length,
          purchasesCount: prevSched.purchases.length,
        },
        trends: {
          salesPct: pct(curSales, prevSales),
          purchasesPct: pct(curPurchases, prevPurchases),
          profitPct: pct(curProfit, prevProfit),
        },
      };
    }),

  /** AI weekly analysis with motivating recommendations */
  weeklyAnalysis: protectedProcedure
    .input(z.object({ referenceDate: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = input.referenceDate ?? new Date();
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const curMonStart = new Date(now);
      curMonStart.setHours(0, 0, 0, 0);
      curMonStart.setDate(curMonStart.getDate() - dayOfWeek);
      const curSunEnd = new Date(curMonStart);
      curSunEnd.setDate(curSunEnd.getDate() + 6);
      curSunEnd.setHours(23, 59, 59, 999);
      const prevMonStart = new Date(curMonStart);
      prevMonStart.setDate(prevMonStart.getDate() - 7);
      const prevSunEnd = new Date(curMonStart);
      prevSunEnd.setDate(prevSunEnd.getDate() - 1);
      prevSunEnd.setHours(23, 59, 59, 999);
      const toISO = (d: Date) => d.toISOString().slice(0, 10);
      const sumCost = (arr: Array<{ cost?: string | number | null }>) =>
        arr.reduce((s, r) => s + (parseFloat(String(r.cost ?? 0)) || 0), 0);

      const [curSched, prevSched] = await Promise.all([
        getScheduleData(ctx.user.id, toISO(curMonStart), toISO(curSunEnd)),
        getScheduleData(ctx.user.id, toISO(prevMonStart), toISO(prevSunEnd)),
      ]);

      const curSales = sumCost(curSched.sales);
      const curPurchases = sumCost(curSched.purchases);
      const prevSales = sumCost(prevSched.sales);
      const prevPurchases = sumCost(prevSched.purchases);

      const curMonth = `${curMonStart.getFullYear()}-${String(curMonStart.getMonth() + 1).padStart(2, '0')}`;
      const prevMonth = `${prevMonStart.getFullYear()}-${String(prevMonStart.getMonth() + 1).padStart(2, '0')}`;
      const [curExpSummary, prevExpSummary] = await Promise.all([
        getExpenseSummary(ctx.user.id, curMonth),
        getExpenseSummary(ctx.user.id, prevMonth),
      ]);
      const curExpenses = (curExpSummary.total ?? 0) / 4.33;
      const prevExpenses = (prevExpSummary.total ?? 0) / 4.33;
      const curProfit = curSales - curPurchases - curExpenses;
      const prevProfit = prevSales - prevPurchases - prevExpenses;

      const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
      const pct = (cur: number, prev: number) =>
        prev === 0 ? 'нет данных за прошлую неделю' : `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / Math.abs(prev)) * 100)}% к прошлой неделе`;

      const weekLabel = (s: Date, e: Date) =>
        `${s.getDate()}.${String(s.getMonth() + 1).padStart(2, '0')}–${e.getDate()}.${String(e.getMonth() + 1).padStart(2, '0')}`;

      const profitEmoji = curProfit >= 0 ? '🟢' : '🔴';
      const salesTrend = pct(curSales, prevSales);
      const profitTrend = pct(curProfit, prevProfit);

      const prompt = `Ты — личный бизнес-тренер владельца рекламного бизнеса в мессенджере Макс.
Твоя задача — дать живой, энергичный разбор недели: похвалить за реальные достижения, честно указать на точки роста и зажечь на следующую неделю.

ТЕКУЩАЯ НЕДЕЛЯ (${weekLabel(curMonStart, curSunEnd)}):
- Продажи: ${fmt(curSales)} (${curSched.sales.length} сделок)
- Закуп: ${fmt(curPurchases)} (${curSched.purchases.length} сделок)
- Расходы (≈ за неделю): ${fmt(curExpenses)}
- Чистая прибыль: ${fmt(curProfit)} ${profitEmoji}

ПРОШЛАЯ НЕДЕЛЯ (${weekLabel(prevMonStart, prevSunEnd)}):
- Продажи: ${fmt(prevSales)} (${prevSched.sales.length} сделок)
- Закуп: ${fmt(prevPurchases)} (${prevSched.purchases.length} сделок)
- Расходы (≈ за неделю): ${fmt(prevExpenses)}
- Чистая прибыль: ${fmt(prevProfit)}

ТРЕНДЫ:
- Продажи: ${salesTrend}
- Закуп: ${pct(curPurchases, prevPurchases)}
- Прибыль: ${profitTrend}

Напиши живой разбор в 4 блоках. Обращайся на «ты», говори как наставник другу:

## 📊 Итог недели
Один абзац — честно и по-человечески: что случилось, ключевые цифры, общее ощущение от недели. Если рост — отметь это с энергией. Если спад — скажи прямо, но без драмы.

## 💪 Молодец, вот что сработало
2–3 конкретных момента с цифрами. Ищи позитив даже в сложной неделе — любой прогресс важен. Говори искренне, не формально.

## 🚀 Вот что сделать на следующей неделе
3 конкретных действия с ожидаемым эффектом в рублях или %. Пиши как план, не как совет. Если прибыль отрицательная — дай чёткий план выхода в плюс с шагами и цифрами.

## 🎯 Главный фокус — одно действие
Самое важное, что принесёт максимум результата. Одно предложение, максимально конкретное.

ТОН: живой, личный, энергичный — как разговор с другом-наставником. Цифры обязательны. Никакой корпоративной воды.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Ты — опытный бизнес-наставник для владельцев рекламных каналов в Макс. Обращайся на «ты», говори как друг-наставник: искренно радуйся успехам, честно указывай на проблемы, зажигай на действия. Пиши конкретно, с цифрами, без корпоративной воды. Даже при отрицательной прибыли — фокус на действиях, а не на проблемах. Никакой катастрофы — только факты и действия." },
          { role: "user", content: prompt },
        ],
      });
      const content = result.choices?.[0]?.message?.content;
      const analysis = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: { type: string; text?: string }) => p.type === "text" ? p.text : "").join("") : "";
      return { analysis };
    }),
  externalAnalytics: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(24).optional() }))
    .query(async ({ ctx, input }) => {
      return getExternalSalesAnalytics(ctx.user.id, input.months);
    }),
});
// ─── Admin procedure guard ─────────────────────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Доступ только для администраторов" });
  }
  return next({ ctx });
});

// ─── Admin router ──────────────────────────────────────────────────────────────────────────────────────
const adminRouter = router({
  /** List all users */
  users: adminProcedure.query(() => getAllUsers()),

  /** Update user role */
  updateRole: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      role: z.enum(["user", "admin", "buyer", "manager"]),
    }))
    .mutation(async ({ input }) => {
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  /** Delete a user */
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteUser(input.userId);
      return { success: true };
    }),

  /** Get all channels (across all owners) */
  allChannels: adminProcedure.query(() => getAllChannels()),

  /** Get all channel assignments */
  assignments: adminProcedure.query(() => getChannelAssignments()),

  /** Get assignments for a specific user */
  userAssignments: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(({ input }) => getUserAssignments(input.userId)),

  /** Set channel assignments for a user (replaces all) */
  setAssignments: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      channelIds: z.array(z.number().int().positive()),
    }))
    .mutation(async ({ ctx, input }) => {
      await setUserChannelAssignments(input.userId, input.channelIds, ctx.user.id);
      return { success: true };
    }),

  /** Delete a single assignment */
  deleteAssignment: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteChannelAssignment(input.id);
      return { success: true };
    }),
});

// ─── Mutual Deals router ─────────────────────────────────────────────────────
const mutualInput = z.object({
  ourChannelId: z.number().int(),
  /** Multiple channel IDs for multi-channel ВП */
  ourChannelIds: z.array(z.number().int()).optional(),
  partnerChannelName: z.string().min(1).max(255),
  partnerContact: z.string().max(255).optional(),
  // Per-side dates (replaces single dealDate)
  ourPostDate: z.date().optional(),
  partnerPostDate: z.date().optional(),
  ourBookingSlot: z.enum(["утро", "обед", "вечер", "ночной топ"]).optional(),
  partnerBookingSlot: z.enum(["утро", "обед", "вечер", "ночной топ"]).optional(),
  ourReach: z.number().int().optional(),
  partnerReach: z.number().int().optional(),
  ourPostLink: z.string().max(1024).optional(),
  partnerPostLink: z.string().max(1024).optional(),
  dealType: z.enum(["без доплаты", "с доплатой"]).default("без доплаты"),
  dopDirection: z.enum(["мы платим", "нам платят"]).optional(),
  dopAmount: z.string().optional(),
  dopPaymentStatus: z.enum(["paid", "unpaid", "not_applicable"]).default("not_applicable"),
  status: z.enum(["предложение", "согласовано", "размещено", "завершено", "отменено"]).default("предложение"),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().optional(),
});

const mutualRouter = router({
  list: protectedProcedure
    .input(z.object({
      month: z.string().optional(),
      status: z.string().optional(),
      ourChannelId: z.number().int().optional(),
    }))
    .query(({ ctx, input }) => getMutualDeals(ctx.user.id, input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ ctx, input }) => getMutualDealById(input.id, ctx.user.id)),

   create: protectedProcedure
    .input(mutualInput)
    .mutation(async ({ ctx, input }) => {
      const id = await createMutualDealWithRecords({
        userId: ctx.user.id,
        ourChannelId: input.ourChannelId,
        ourChannelIds: input.ourChannelIds,
        partnerChannelName: input.partnerChannelName,
        partnerContact: input.partnerContact ?? null,
        ourPostDate: input.ourPostDate ?? null,
        partnerPostDate: input.partnerPostDate ?? null,
        ourBookingSlot: input.ourBookingSlot ?? null,
        partnerBookingSlot: input.partnerBookingSlot ?? null,
        ourReach: input.ourReach ?? null,
        partnerReach: input.partnerReach ?? null,
        ourPostLink: input.ourPostLink ?? null,
        partnerPostLink: input.partnerPostLink ?? null,
        dealType: input.dealType,
        dopDirection: input.dopDirection ?? null,
        dopAmount: input.dopAmount ?? null,
        dopPaymentStatus: input.dopPaymentStatus,
        status: input.status,
        month: input.month,
        notes: input.notes ?? null,
      });
      return { id };
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number().int() }).merge(mutualInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateMutualDealWithRecords(id, ctx.user.id, data as any);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteMutualDealWithRecords(input.id, ctx.user.id);;
      return { success: true };
    }),

  calcDoplate: protectedProcedure
    .input(z.object({
      ourReach: z.number().int(),
      partnerReach: z.number().int(),
      baseSpm: z.number().optional(),
    }))
    .query(({ input }) => calcRecommendedDoplate(input.ourReach, input.partnerReach, input.baseSpm)),
  summary: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const deals = await getMutualDeals(ctx.user.id, { month: input.month });
      const total = deals.length;
      const byStatus = deals.reduce((acc, d) => {
        acc[d.status] = (acc[d.status] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const totalDopPaid = deals
        .filter(d => d.dopDirection === 'мы платим' && d.dopAmount)
        .reduce((s, d) => s + parseFloat(String(d.dopAmount ?? 0)), 0);
      const totalDopReceived = deals
        .filter(d => d.dopDirection === 'нам платят' && d.dopAmount)
        .reduce((s, d) => s + parseFloat(String(d.dopAmount ?? 0)), 0);
      const avgOurReach = (() => {
        const vals = deals.filter(d => d.ourReach != null).map(d => d.ourReach as number);
        return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      })();
      const avgPartnerReach = (() => {
        const vals = deals.filter(d => d.partnerReach != null).map(d => d.partnerReach as number);
        return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      })();
      const reachBalance = (avgOurReach ?? 0) - (avgPartnerReach ?? 0);
      return { total, byStatus, totalDopPaid, totalDopReceived, avgOurReach, avgPartnerReach, reachBalance };
    }),
});

// ─── Subscriber Snapshots router ───────────────────────────────────────────────
const snapshotsRouter = router({
  list: protectedProcedure
    .input(z.object({ channelId: z.number().int().positive().optional() }))
    .query(({ ctx, input }) => listSubscriberSnapshots(ctx.user.id, input.channelId)),

  upsert: protectedProcedure
    .input(z.object({
      channelId: z.number().int().positive(),
      subscriberCount: z.number().int().nonnegative(),
      snapshotDate: z.string(), // ISO date string
      notes: z.string().optional(),
      // Trustat-style metrics (all optional)
      views24h: z.number().int().nonnegative().optional(),
      views48h: z.number().int().nonnegative().optional(),
      views72h: z.number().int().nonnegative().optional(),
      er24: z.number().min(0).max(100).optional(), // ER percentage 0-100
      weeklyGrowth: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertSubscriberSnapshot({
        userId: ctx.user.id,
        channelId: input.channelId,
        subscriberCount: input.subscriberCount,
        snapshotDate: new Date(input.snapshotDate),
        notes: input.notes ?? null,
        views24h: input.views24h ?? null,
        views48h: input.views48h ?? null,
        views72h: input.views72h ?? null,
        er24: input.er24 !== undefined ? String(input.er24) : null,
        weeklyGrowth: input.weeklyGrowth ?? null,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSubscriberSnapshot(input.id, ctx.user.id);
      return { success: true };
    }),

  cpfAnalytics: protectedProcedure
    .input(z.object({
      channelIds: z.array(z.number().int().positive()).optional(),
      month: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userChannels = await import("./db").then(m => m.getChannelsByUser(ctx.user.id));
      const ids = input.channelIds ?? userChannels.map((c: { id: number }) => c.id);
      return getCpfAnalytics(ctx.user.id, ids, input.month);
    }),

  sourceEfficiency: protectedProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(({ ctx, input }) => getSourceEfficiency(ctx.user.id, input?.month)),
  channelStats: protectedProcedure
    .input(z.object({ channelId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const snaps = await listSubscriberSnapshots(ctx.user.id, input.channelId);
      if (!snaps || snaps.length === 0) return null;
      // Sort by date ascending
      const sorted = [...snaps].sort(
        (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime()
      );
      const latest = sorted[sorted.length - 1];
      const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      const growth = prev ? latest.subscriberCount - prev.subscriberCount : null;
      // ER24 trend: last 4 snapshots with er24
      const erTrend = sorted
        .filter((s) => s.er24 != null)
        .slice(-4)
        .map((s) => ({ date: s.snapshotDate, er24: parseFloat(String(s.er24)) }));
      // Views trend: last 4 snapshots with views24h
      const viewsTrend = sorted
        .filter((s) => s.views24h != null)
        .slice(-4)
        .map((s) => ({ date: s.snapshotDate, views24h: s.views24h, views48h: s.views48h, views72h: s.views72h }));
      return {
        latestSubscribers: latest.subscriberCount,
        latestDate: latest.snapshotDate,
        growth,
        views24h: latest.views24h ?? null,
        views48h: latest.views48h ?? null,
        views72h: latest.views72h ?? null,
        er24: latest.er24 != null ? parseFloat(String(latest.er24)) : null,
        weeklyGrowth: latest.weeklyGrowth ?? null,
        erTrend,
        viewsTrend,
        totalSnapshots: sorted.length,
      };
    }),
});

// ─── OCR / Screenshot recognition router ────────────────────────────────────────────────────────────────────────────
const ocrRouter = router({
  /**
   * Accepts a base64-encoded Trustat screenshot and returns structured
   * channel statistics extracted by the vision LLM.
   */
  recognizeTrustatScreenshot: protectedProcedure
    .input(z.object({
      imageBase64: z.string().min(100),
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]).default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Ты — ассистент для распознавания скриншотов статистики каналов из сервиса Trustat (аналитика MAX/ВКонтакте).
Извлеки данные из скриншота и верни их в виде JSON. Если поле не найдено — верни null.
Поля для извлечения:
- channelName: название канала (строка) или null
- subscriberCount: количество подписчиков (число) или null
- views24h: просмотры/охваты за 24 часа (число) или null
- views48h: просмотры/охваты за 48 часов (число) или null
- views72h: просмотры/охваты за 72 часа (число) или null
- er24: ER за 24 часа в процентах (число, например 13.93) или null
- weeklyGrowth: прирост подписчиков за неделю (число) или null
- snapshotDate: дата актуальности данных в формате YYYY-MM-DD или null
Верни ТОЛЬКО валидный JSON объект без markdown-блоков.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Извлеки статистику канала из этого скриншота Trustat:" },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "trustat_screenshot_data",
            strict: true,
            schema: {
              type: "object",
              properties: {
                channelName: { type: ["string", "null"] },
                subscriberCount: { type: ["number", "null"] },
                views24h: { type: ["number", "null"] },
                views48h: { type: ["number", "null"] },
                views72h: { type: ["number", "null"] },
                er24: { type: ["number", "null"] },
                weeklyGrowth: { type: ["number", "null"] },
                snapshotDate: { type: ["string", "null"] },
              },
              required: ["channelName", "subscriberCount", "views24h", "views48h", "views72h", "er24", "weeklyGrowth", "snapshotDate"],
              additionalProperties: false,
            },
          },
        },
      });
      const raw = result.choices[0]?.message?.content;
      if (!raw || typeof raw !== "string") {
        throw new Error("LLM вернул пустой ответ");
      }
      try {
        const parsed = JSON.parse(raw) as {
          channelName: string | null;
          subscriberCount: number | null;
          views24h: number | null;
          views48h: number | null;
          views72h: number | null;
          er24: number | null;
          weeklyGrowth: number | null;
          snapshotDate: string | null;
        };
        return { success: true as const, data: parsed };
      } catch {
        return { success: false as const, error: "Не удалось разобрать ответ AI", raw };
      }
    }),

  /**
   * Fetches a Trustat/anypost share link and extracts post statistics.
   * Uses Next.js RSC payload to get structured JSON data without scraping.
   * Also supports generic URLs via LLM text extraction as fallback.
   */
  analyzeLink: protectedProcedure
    .input(z.object({
      url: z.string().url(),
    }))
    .mutation(async ({ input }) => {
      const { url } = input;
      // ── SSRF protection: block private/internal IP ranges only ────────────────
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Некорректный URL' });
      }
      const hostname = parsedUrl.hostname.toLowerCase();
      // Block private/internal IP ranges to prevent SSRF
      if (/^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1|\[::1\])/.test(hostname)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Доступ к локальным адресам запрещён' });
      }

      // ── Trustat / anypost share link ──────────────────────────────────────
      const trustatMatch = url.match(
        /anypost\.trustat\.me\/share\/stats\/([a-f0-9]+)/i
      );
      if (trustatMatch) {
        const rscResp = await fetch(url, {
          headers: {
            "RSC": "1",
            "Next-Url": new URL(url).pathname,
            "User-Agent": "Mozilla/5.0 (compatible; MaxAdsManager/1.0)",
          },
        });
        if (!rscResp.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Не удалось загрузить страницу: ${rscResp.status}` });
        }
        const text = await rscResp.text();

        // RSC payload contains lines like: 6:["$","$L1d",null,{...report...}]
        // Find the line with reportBasePath and report JSON
        const lines = text.split("\n");
        let reportData: any = null;
        for (const line of lines) {
          if (line.includes("reportBasePath") && line.includes("report")) {
            const match = line.match(/^[0-9a-f]+:([\s\S]*)/);
            if (match) {
              try {
                const parsed = JSON.parse(match[1]);
                // parsed is [$, $L1d, null, { token, reportBasePath, report }]
                if (Array.isArray(parsed) && parsed[3]?.report) {
                  reportData = parsed[3].report;
                }
              } catch {
                // ignore parse errors
              }
            }
            break;
          }
        }

        if (!reportData) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Данные отчёта не найдены в ссылке. Возможно, ссылка устарела." });
        }

        // Build per-channel results
        const posts: Array<{
          channelTitle: string;
          channelSubs: number | null;
          currentViews: number | null;
          views24h: number | null;
          views48h: number | null;
          views72h: number | null;
          er24h: number | null;
          postedAt: string | null;
          postUrl: string | null;
        }> = (reportData.posts ?? []).map((p: any) => ({
          channelTitle: p.channel_title ?? null,
          channelSubs: p.channel_subs ?? null,
          currentViews: p.current_views ?? p.views ?? null,
          views24h: p.views_24h ?? null,
          views48h: p.views_48h ?? null,
          views72h: p.views_72h ?? null,
          er24h: p.err_24h != null ? Math.round(p.err_24h * 10) / 10 : null,
          postedAt: p.posted_at ?? null,
          postUrl: p.post_url ?? null,
        }));

        return {
          type: "trustat" as const,
          draftName: reportData.draft_name ?? null,
          publishedAt: reportData.published_at ?? null,
          summary: {
            currentViews: reportData.summary?.current_views ?? null,
            views24h: reportData.summary?.views_24h ?? null,
            views48h: reportData.summary?.views_48h ?? null,
            views72h: reportData.summary?.views_72h ?? null,
            er24h: reportData.summary?.err_24h != null
              ? Math.round(reportData.summary.err_24h * 10) / 10
              : null,
            subscribersTotal: reportData.summary?.subscribers_total_known ?? null,
          },
          posts,
        };
      }

      // ── Otlozhka / Marketly analytics link ─────────────────────────────────
      const otlozhkaMatch = url.match(/otlozhka\.marketly\.ru\/analytics\/stats\/([a-f0-9-]+)/i);
      if (otlozhkaMatch) {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ru-RU,ru;q=0.9",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Не удалось загрузить страницу otlozhka: ${resp.status}` });
        }
        const html = await resp.text();

        // Extract targetsData JSON from the HTML
        const targetsMatch = html.match(/var targetsData = (\[.*?\]);/);
        if (!targetsMatch) {
          // Session expired or no data - fall through to LLM
          throw new TRPCError({ code: "NOT_FOUND", message: "Данные otlozhka не найдены. Возможно, ссылка устарела (сессия истекла)." });
        }

        let targets: any[];
        try {
          targets = JSON.parse(targetsMatch[1]);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось разобрать данные otlozhka" });
        }

        const posts = targets.map((t: any) => {
          // statistics is an object {"minutes": views}, compute views at 24h (1440min), 48h (2880min), 72h (4320min)
          const stats: Record<string, number> = t.statistics ?? {};
          const getViews = (minutes: number): number | null => {
            // Find the closest key <= minutes
            const keys = Object.keys(stats).map(Number).filter(k => k <= minutes).sort((a, b) => b - a);
            return keys.length > 0 ? stats[String(keys[0])] ?? null : null;
          };
          return {
            channelTitle: t.channel_title ?? null,
            channelSubs: t.subscribers_count ?? null,
            currentViews: t.current_views ?? null,
            views24h: getViews(1440),
            views48h: getViews(2880),
            views72h: getViews(4320),
            er24h: null,
            postedAt: t.published_at ?? null,
            postUrl: url,
          };
        });

        const firstPost = posts[0] ?? { channelTitle: null, channelSubs: null, currentViews: null, views24h: null, views48h: null, views72h: null, er24h: null, postedAt: null, postUrl: url };
        return {
          type: "generic" as const,
          draftName: null,
          publishedAt: firstPost.postedAt ?? null,
          summary: {
            currentViews: posts.reduce((s: number, p: any) => s + (p.currentViews ?? 0), 0) || null,
            views24h: posts.reduce((s: number, p: any) => s + (p.views24h ?? 0), 0) || null,
            views48h: posts.reduce((s: number, p: any) => s + (p.views48h ?? 0), 0) || null,
            views72h: posts.reduce((s: number, p: any) => s + (p.views72h ?? 0), 0) || null,
            er24h: null,
            subscribersTotal: posts.reduce((s: number, p: any) => s + (p.channelSubs ?? 0), 0) || null,
          },
          posts,
        };
      }

      // ── Generic URL fallback: fetch HTML and ask LLM to extract stats ─────
      let pageText = "";
      let pageHtml = "";
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(15_000),
        });
        pageHtml = await resp.text();
        // Strip tags, keep text - increase limit for multi-channel pages
        pageText = pageHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 12000);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Не удалось загрузить страницу: ${e.message}` });
      }

      const llmResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Ты — ассистент для извлечения статистики рекламных постов из текста страницы трекера рекламы (таких как tgstat, telemetr, iimax, amvera и др.).
Страница может содержать данные по одному или нескольким каналам.
Извлеки данные и верни JSON. Если поле не найдено — верни null.

Важно:
- Если на странице данные по нескольким каналам/постам — заполни массив posts для каждого.
- Если данные только по одному каналу — помести его в posts[0].
- views24h/48h/72h: число просмотров за соответствующий период (может быть обозначено как "24ч", "48ч", "72ч", "1 день", "2 дня" и т.д.)
- channelSubs: количество подписчиков канала (не путать с просмотрами)
- er24h: процент вовлеченности (ERR/ER) за 24ч
- postedAt: дата публикации поста в формате ISO 8601`,
          },
          {
            role: "user",
            content: `URL: ${url}\n\nТекст страницы:\n${pageText}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "link_stats_multi",
            strict: true,
            schema: {
              type: "object",
              properties: {
                postedAt: { type: ["string", "null"] },
                draftName: { type: ["string", "null"] },
                posts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      channelTitle: { type: ["string", "null"] },
                      channelSubs: { type: ["integer", "null"] },
                      currentViews: { type: ["integer", "null"] },
                      views24h: { type: ["integer", "null"] },
                      views48h: { type: ["integer", "null"] },
                      views72h: { type: ["integer", "null"] },
                      er24h: { type: ["number", "null"] },
                      postedAt: { type: ["string", "null"] },
                    },
                    required: ["channelTitle", "channelSubs", "currentViews", "views24h", "views48h", "views72h", "er24h", "postedAt"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["postedAt", "draftName", "posts"],
              additionalProperties: false,
            },
          },
        },
      });

      let extracted: any = { posts: [], postedAt: null, draftName: null };
      try {
        extracted = JSON.parse(llmResult.choices[0].message.content as string);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось разобрать ответ AI" });
      }

      const extractedPosts: Array<any> = (extracted.posts ?? []).map((p: any) => ({
        channelTitle: p.channelTitle ?? null,
        channelSubs: p.channelSubs ?? null,
        currentViews: p.currentViews ?? null,
        views24h: p.views24h ?? null,
        views48h: p.views48h ?? null,
        views72h: p.views72h ?? null,
        er24h: p.er24h ?? null,
        postedAt: p.postedAt ?? extracted.postedAt ?? null,
        postUrl: url,
      }));

      // If LLM returned no posts, create a fallback empty post
      if (extractedPosts.length === 0) {
        extractedPosts.push({
          channelTitle: null, channelSubs: null, currentViews: null,
          views24h: null, views48h: null, views72h: null,
          er24h: null, postedAt: extracted.postedAt ?? null, postUrl: url,
        });
      }

      const firstPost = extractedPosts[0];
      return {
        type: "generic" as const,
        draftName: extracted.draftName ?? null,
        publishedAt: extracted.postedAt ?? firstPost.postedAt ?? null,
        summary: {
          currentViews: firstPost.currentViews ?? null,
          views24h: firstPost.views24h ?? null,
          views48h: firstPost.views48h ?? null,
          views72h: firstPost.views72h ?? null,
          er24h: firstPost.er24h ?? null,
          subscribersTotal: firstPost.channelSubs ?? null,
        },
        posts: extractedPosts,
      };
    }),

  /**
   * Accepts a base64-encoded image (PNG/JPEG/WEBP) and returns structured
   * purchase data extracted by the vision LLM.
   */
  recognizePurchaseScreenshot: protectedProcedure
    .input(z.object({
      /** base64-encoded image WITHOUT the data:... prefix */
      imageBase64: z.string().min(100),
      /** MIME type of the image */
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]).default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Ты — ассистент для распознавания скриншотов статистики рекламных закупов в мессенджере MAX (ВКонтакте).
Извлеки данные из скриншота и верни их в виде JSON. Если поле не найдено — верни null.
Поля для извлечения:
- channelName: название канала-источника (откуда пришли подписчики), строка или null
- date: дата закупа в формате YYYY-MM-DD или null
- subscribersGained: количество подписавшихся (число) или null
- subscribersLeft: количество отписавшихся (число) или null
- reach: просмотры/охваты (число) или null
- cost: стоимость размещения в рублях (число) или null
- cpm: CPM/СПМ в рублях (число) или null
- pricePerSubscriber: цена ПДП/цена подписчика в рублях (число) или null
- creative: название/тип креатива (строка) или null
- timeSlot: время выхода поста (строка, например "22:09") или null

Верни ТОЛЬКО валидный JSON объект без markdown-блоков.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Извлеки данные из этого скриншота статистики закупа:" },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "purchase_screenshot_data",
            strict: true,
            schema: {
              type: "object",
              properties: {
                channelName: { type: ["string", "null"] },
                date: { type: ["string", "null"] },
                subscribersGained: { type: ["number", "null"] },
                subscribersLeft: { type: ["number", "null"] },
                reach: { type: ["number", "null"] },
                cost: { type: ["number", "null"] },
                cpm: { type: ["number", "null"] },
                pricePerSubscriber: { type: ["number", "null"] },
                creative: { type: ["string", "null"] },
                timeSlot: { type: ["string", "null"] },
              },
              required: ["channelName", "date", "subscribersGained", "subscribersLeft", "reach", "cost", "cpm", "pricePerSubscriber", "creative", "timeSlot"],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = result.choices[0]?.message?.content;
      if (!raw || typeof raw !== "string") {
        throw new Error("LLM вернул пустой ответ");
      }

      try {
        const parsed = JSON.parse(raw) as {
          channelName: string | null;
          date: string | null;
          subscribersGained: number | null;
          subscribersLeft: number | null;
          reach: number | null;
          cost: number | null;
          cpm: number | null;
          pricePerSubscriber: number | null;
          creative: string | null;
          timeSlot: string | null;
        };
        return { success: true as const, data: parsed };
      } catch {
        return { success: false as const, error: "Не удалось разобрать ответ AI", raw };
      }
    }),
});

// ─── Expenses router ─────────────────────────────────────────────────────────
const expensesRouter = router({
  list: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(({ ctx, input }) => getExpenses(ctx.user.id, input.month)),

  summary: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(({ ctx, input }) => getExpenseSummary(ctx.user.id, input.month)),

  create: protectedProcedure
    .input(z.object({
      month: z.string().min(7).max(7),
      category: z.string().min(1).max(100),
      description: z.string().optional(),
      amount: z.number().positive(),
      paymentStatus: z.enum(["paid", "unpaid"]).optional(),
    }))
    .mutation(({ ctx, input }) =>
      createExpense({ ...input, userId: ctx.user.id })
    ),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      month: z.string().min(7).max(7).optional(),
      category: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      amount: z.number().positive().optional(),
      paymentStatus: z.enum(["paid", "unpaid"]).optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateExpense(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteExpense(input.id, ctx.user.id)),
});

// ─── Post Analytics router ──────────────────────────────────────────────────
const postAnalyticsRouter = router({
  /** Fetch analytics for a specific record (sale or purchase) */
  getByRecord: protectedProcedure
    .input(z.object({
      recordType: z.enum(["sale", "purchase"]),
      recordId: z.number().int().positive(),
    }))
    .query(({ input }) => getPostAnalyticsByRecord(input.recordType, input.recordId)),

  /** Manually trigger analytics fetch for a record with a link */
  fetch: protectedProcedure
    .input(z.object({
      recordType: z.enum(["sale", "purchase"]),
      recordId: z.number().int().positive(),
      url: z.string().url(),
    }))
    .mutation(({ ctx, input }) =>
      upsertPostAnalytics(ctx.user.id, input.recordType, input.recordId, input.url)
    ),

  /** List all fetched analytics for the current user */
  list: protectedProcedure
    .query(({ ctx }) => getPostAnalyticsByUser(ctx.user.id)),
  /** Batch-fetch analytics for all paid records with links that don't have analytics yet */
  fetchAllMissing: protectedProcedure
    .mutation(async ({ ctx }) => {
      const [sales, purchases, existing] = await Promise.all([
        getSaleRecords(ctx.user.id, {}),
        getPurchaseRecords(ctx.user.id, {}),
        getPostAnalyticsByUser(ctx.user.id),
      ]);
      const existingKeys = new Set(
        existing.map((a) => `${a.recordType}:${a.recordId}`)
      );
      const toFetch: Array<{ recordType: "sale" | "purchase"; recordId: number; url: string }> = [];
      for (const r of sales) {
        if (r.paymentStatus === "paid" && r.link && !existingKeys.has(`sale:${r.id}`)) {
          toFetch.push({ recordType: "sale", recordId: r.id, url: r.link });
        }
      }
      for (const r of purchases) {
        if (r.paymentStatus === "paid" && r.link && !existingKeys.has(`purchase:${r.id}`)) {
          toFetch.push({ recordType: "purchase", recordId: r.id, url: r.link });
        }
      }
      if (toFetch.length === 0) return { fetched: 0, skipped: 0 };
      let fetched = 0;
      let skipped = 0;
      for (const item of toFetch) {
        try {
          await upsertPostAnalytics(ctx.user.id, item.recordType, item.recordId, item.url);
          fetched++;
        } catch {
          skipped++;
        }
      }
      return { fetched, skipped };
    }),
});

// ─── Clients router ─────────────────────────────────────────────────────────
const clientChannelSchema = z.object({
  channelName: z.string().min(1).max(255),
  channelUrl: z.string().max(1024).optional().nullable(),
  subscribers: z.number().int().optional().nullable(),
});

const clientsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listClients(ctx.user.id)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ ctx, input }) => getClientById(input.id, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      maxNick: z.string().max(255).optional().nullable(),
      type: z.enum(["продаём", "закупаем", "оба"]).default("оба"),
      niche: z.string().max(255).optional().nullable(),
      notes: z.string().optional().nullable(),
      channels: z.array(clientChannelSchema).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { channels, ...clientData } = input;
      const id = await createClient({ ...clientData, userId: ctx.user.id });
      if (channels.length > 0) await setClientChannels(id, channels);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(255).optional(),
      maxNick: z.string().max(255).optional().nullable(),
      type: z.enum(["продаём", "закупаем", "оба"]).optional(),
      niche: z.string().max(255).optional().nullable(),
      notes: z.string().optional().nullable(),
      channels: z.array(clientChannelSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, channels, ...data } = input;
      await updateClient(id, ctx.user.id, data);
      if (channels !== undefined) await setClientChannels(id, channels);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => deleteClient(input.id, ctx.user.id)),

  autoImport: protectedProcedure
    .mutation(({ ctx }) => autoImportClients(ctx.user.id)),

  getStats: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ ctx, input }) => getClientStats(input.id, ctx.user.id)),

  getPurchases: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const purchases = await getClientPurchases(input.id, ctx.user.id);
      const userChannels = await getChannelsByUser(ctx.user.id);
      const channelNameMap = new Map(userChannels.map((c) => [c.id, c.name]));
      return purchases.map((p) => {
        const cost = parseFloat(String(p.cost ?? "0")) || 0;
        const subs = p.subscribersGained ?? 0;
        return {
          ...p,
          channelName: channelNameMap.get(p.channelId) ?? null,
          costPerFollower: subs > 0 ? Math.round((cost / subs) * 100) / 100 : null,
          postUrl: p.link ?? null,
        };
      });
    }),

  getSales: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ ctx, input }) => getClientSales(input.id, ctx.user.id)),
  analyze: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const stats = await getClientStats(input.id, ctx.user.id);
      if (!stats) throw new TRPCError({ code: "NOT_FOUND", message: "Клиент не найден" });

      // Attributed CPF data (algorithm C: reach if available, else cost)
      const attributedPurchases = await getClientAttributedCpf(input.id, ctx.user.id);
      const sales = await getClientSales(input.id, ctx.user.id);

      // Build channelId -> name map
      const userChannels = await getChannelsByUser(ctx.user.id);
      const channelMap = new Map(userChannels.map(c => [c.id, c.name]));

      // Aggregate attributed CPF stats
      const purchasesWithCpf = attributedPurchases.filter(p => p.cpf !== null);
      const avgAttrCpf = purchasesWithCpf.length
        ? purchasesWithCpf.reduce((s, p) => s + p.cpf!, 0) / purchasesWithCpf.length
        : null;
      const totalAttrSubs = attributedPurchases.reduce((s, p) => s + (p.growthAttributed ?? 0), 0);
      const coverageCount = attributedPurchases.filter(p => p.method !== "none").length;
      const coveragePct = attributedPurchases.length > 0
        ? Math.round((coverageCount / attributedPurchases.length) * 100)
        : 0;

      // Build purchases summary with attributed CPF
      const purchaseLines = attributedPurchases.slice(0, 30).map(p => {
        const cpfStr = p.cpf !== null ? `CPF ${p.cpf.toFixed(1)}₽` : `CPF —`;
        const subsStr = p.growthAttributed !== null ? `+${p.growthAttributed} подп.` : `+? подп.`;
        const reachStr = p.reach ? `охват ${p.reach.toLocaleString('ru-RU')}` : "";
        const methodStr = p.method === "reach" ? "[по охвату]" : p.method === "cost" ? "[по стоимости]" : "[без снапшота]";
        const date = p.date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' });
        return `  • ${date} | ${p.channelName} | ${p.cost.toLocaleString('ru-RU')}₽ | ${subsStr} | ${cpfStr} | ${reachStr} ${methodStr}`;
      }).join('\n');

      // Build sales summary
      const saleLines = sales.slice(0, 30).map(s => {
        const cost = parseFloat(String(s.cost ?? "0")) || 0;
        const reach = s.reach ? `охват ${s.reach.toLocaleString('ru-RU')}` : "";
        const date = s.date ? new Date(s.date).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) : "";
        const slot = s.timeSlot ?? "";
        const chName = channelMap.get(s.channelId) ?? '?';
        return `  • ${date} | ${chName} | ${cost.toLocaleString('ru-RU')}₽ | ${slot} | ${reach}`;
      }).join('\n');

      const channelsList = stats.channels.map(ch =>
        `${ch.channelName}${ch.subscribers ? ` (${ch.subscribers.toLocaleString('ru-RU')} подп.)` : ''}`
      ).join(', ') || 'не указаны';
      const cpfStr = avgAttrCpf != null ? `${avgAttrCpf.toFixed(1)}₽ (атрибуция, покрытие ${coveragePct}%)` : 'нет данных';
      const avgPurchReach = stats.avgPurchaseReach != null ? stats.avgPurchaseReach.toLocaleString('ru-RU') : 'нет данных';
      const avgSaleReach = stats.avgSaleReach != null ? stats.avgSaleReach.toLocaleString('ru-RU') : 'нет данных';
      const balance = stats.totalSaleRevenue - stats.totalPurchaseCost;
      const balanceStr = balance >= 0 ? `+${balance.toLocaleString('ru-RU')}₽` : `${balance.toLocaleString('ru-RU')}₽`;

      const prompt = `Ты анализируешь конкретного рекламного клиента/партнёра.
КЛИЕНТ: ${stats.clientName}${stats.maxNick ? ` (@${stats.maxNick})` : ''}
Тип: ${stats.type} | Ниша: ${stats.niche ?? 'не указана'}
Каналы клиента: ${channelsList}

СТАТИСТИКА:
- Закупов у клиента: ${stats.purchaseCount} на сумму ${stats.totalPurchaseCost.toLocaleString('ru-RU')}₽
- Продаж клиенту: ${stats.saleCount} на сумму ${stats.totalSaleRevenue.toLocaleString('ru-RU')}₽
- Оборот: ${stats.totalTurnover.toLocaleString('ru-RU')}₽ | Баланс: ${balanceStr}
- Атрибутированных подписчиков: ${totalAttrSubs.toLocaleString('ru-RU')} (по недельному росту канала)
- Средний CPF: ${cpfStr}
- Метод атрибуции: пропорционально охвату (если есть) или стоимости закупов в неделю
- Средний охват (закуп): ${avgPurchReach}
- Средний охват (продажа): ${avgSaleReach}
${stats.notes ? `- Заметки: ${stats.notes}` : ''}

ПОСЛЕДНИЕ ЗАКУПЫ с атрибуцией (до 30):
${purchaseLines || '  Нет данных'}

ПОСЛЕДНИЕ ПРОДАЖИ (до 30):
${saleLines || '  Нет данных'}

ЗАДАНИЕ: Дай развёрнутый анализ этого клиента на русском языке в формате markdown.
Структура ответа:
## 🧑‍💼 Портрет клиента
Кратко: кто это, какой тип сотрудничества, насколько активен, общий оборот и баланс.
## 📦 Анализ закупов
Если есть закупы — оцени CPF (< 5₽ = отлично, 5–15₽ = норма, > 15₽ = дорого), динамику активности, лучшие и худшие каналы по CPF. Укажи метод атрибуции. Конкретные рекомендации.
## 💰 Анализ продаж
Если есть продажи — оцени средний охват, стоимость, частоту. Есть ли потенциал увеличить цену или объём? Конкретные рекомендации.
## 🤝 Оценка партнёрства
Выгоден ли этот клиент? Баланс закуп/продажа, надёжность (частота сделок), потенциал роста. Стоит ли развивать сотрудничество?
## 🎯 Следующие шаги
2–3 конкретных действия: что предложить клиенту, как изменить условия, что проверить.
Максимум 500 слов. Используй реальные цифры. Тон — деловой и конструктивный.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Ты — эксперт по рекламному бизнесу в Макс/Телеграм. Анализируешь клиентов и партнёров, даёшь конкретные деловые рекомендации на русском языке." },
          { role: "user", content: prompt },
        ],
      });
      const content = result.choices?.[0]?.message?.content;
      const analysis = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: { type: string; text?: string }) => p.type === "text" ? p.text : "").join("") : "";
      return { analysis };
    }),
});

// ─── App router ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const appRouter = router({system: systemRouter,  auth: router({
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
  schedule: scheduleRouter,
  summary: summaryRouter,
  ai: aiRouter,
  admin: adminRouter,
  mutual: mutualRouter,
  snapshots: snapshotsRouter,
  ocr: ocrRouter,
   expenses: expensesRouter,
  postAnalytics: postAnalyticsRouter,
  clients: clientsRouter,
});
export type AppRouter = typeof appRouter;
