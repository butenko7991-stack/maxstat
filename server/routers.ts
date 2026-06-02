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
  calcRecommendedDoplate,
  listSubscriberSnapshots,
  upsertSubscriberSnapshot,
  deleteSubscriberSnapshot,
  getCpfAnalytics,
  getSourceEfficiency,
} from "./db";
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await updateChannel(id, ctx.user.id, rest);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
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
  botStories: z.string().max(255).optional(),
  botStoriesCost: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().optional(),
  timeSlot: timeSlotEnum.optional(),
  bookingSlot: z.enum(["утро", "обед", "вечер"]).optional(),
  sourceSubscribers: z.number().int().nonnegative().optional(),
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
      botStories: input.botStories ?? null,
      botStoriesCost: input.botStoriesCost ?? null,
      month: input.month,
      notes: input.notes ?? null,
      timeSlot: input.timeSlot ?? null,
      bookingSlot: input.bookingSlot ?? deriveBookingSlot(input.timeSlot),
      sourceSubscribers: input.sourceSubscribers ?? null,
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
        bookingSlot: z.enum(["утро", "обед", "вечер"]).optional(),
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
      botStories: z.string().max(255).optional(),
      botStoriesCost: z.string().optional(),
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
          botStories: input.botStories ?? null,
          botStoriesCost: input.botStoriesCost ?? null,
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
});
// ─── Sales router ─────────────────────────────────────────────────────────────

/** Derive a bookingSlot from a free-text timeSlot string.
 * Maps time values to утро/обед/вечер based on hour of day.
 * Also handles direct text values like "утро", "обед", "вечер".
 */
function deriveBookingSlot(timeSlot: string | undefined | null): "утро" | "обед" | "вечер" | null {
  if (!timeSlot) return null;
  const lower = timeSlot.toLowerCase().trim();
  if (lower === "утро" || lower === "утром") return "утро";
  if (lower === "обед" || lower === "днём" || lower === "день") return "обед";
  if (lower === "вечер" || lower === "вечером") return "вечер";
  // Try to parse HH:MM or HH.MM format
  const match = lower.match(/^(\d{1,2})[:\.](\d{2})/);
  if (match) {
    const hour = parseInt(match[1], 10);
    if (hour < 12) return "утро";
    if (hour < 17) return "обед";
    return "вечер";
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
  botStories: z.string().max(255).optional(),
  botStoriesCost: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  bookingSlot: z.enum(["утро", "обед", "вечер"]).optional(),
  postNotNeeded: z.boolean().optional(),
  buyerSubscribers: z.number().int().nonnegative().optional(),
  // ВП fields
  isMutual: z.boolean().optional(),
  partnerChannel: z.string().max(255).optional(),
  ourReach: z.number().int().nonnegative().optional(),
  partnerReach: z.number().int().nonnegative().optional(),
  dopDirection: z.enum(["we_pay", "they_pay", "none"]).optional(),
  dopAmount: z.string().optional(),
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
      botStories: input.botStories ?? null,
      botStoriesCost: input.botStoriesCost ?? null,
      month: input.month,
      postNotNeeded: input.postNotNeeded ?? false,
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
        bookingSlot: z.enum(["утро", "обед", "вечер"]).optional(),
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
      botStories: z.string().max(255).optional(),
      botStoriesCost: z.string().optional(),
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
          botStories: input.botStories ?? null,
          botStoriesCost: input.botStoriesCost ?? null,
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
      const data = await getChannelProfitability(ctx.user.id, input.month);
      if (data.channels.length === 0) {
        return { analysis: "Нет данных для анализа. Добавьте записи о продажах и закупках." };
      }
      // Fetch CPF analytics and latest snapshots for ER/reach data
      const userChannels = await getChannelsByUser(ctx.user.id);
      const channelIds = userChannels.map((c: { id: number }) => c.id);
      const cpfData = await getCpfAnalytics(ctx.user.id, channelIds);
      const snapshots = await listSubscriberSnapshots(ctx.user.id, undefined);
      // Get latest snapshot per channel for current ER/reach/subscribers
      const latestSnap = new Map<number, typeof snapshots[0]>();
      for (const s of snapshots) {
        const ex = latestSnap.get(s.channelId);
        if (!ex || new Date(s.snapshotDate) > new Date(ex.snapshotDate)) {
          latestSnap.set(s.channelId, s);
        }
      }
      // Aggregate CPF stats per channel
      const cpfByChannel = new Map<number, { cpfs: number[]; totalGrowth: number; totalCost: number }>();
      for (const row of cpfData) {
        if (!cpfByChannel.has(row.channelId)) cpfByChannel.set(row.channelId, { cpfs: [], totalGrowth: 0, totalCost: 0 });
        const entry = cpfByChannel.get(row.channelId)!;
        if (row.cpf !== null) entry.cpfs.push(row.cpf);
        entry.totalGrowth += row.growth;
        entry.totalCost += row.purchaseCost;
      }
      const channelsSummary = data.channels.map(c => {
        const snap = latestSnap.get(c.channelId);
        const cpfStats = cpfByChannel.get(c.channelId);
        const avgCpf = cpfStats && cpfStats.cpfs.length > 0
          ? (cpfStats.cpfs.reduce((s, v) => s + v, 0) / cpfStats.cpfs.length).toFixed(2)
          : null;
        const er24 = snap?.er24 ? parseFloat(String(snap.er24)).toFixed(2) : null;
        const views24h = snap?.views24h ?? null;
        const subs = snap?.subscriberCount ?? null;
        const growth = cpfStats?.totalGrowth ?? null;
        return [
          `### ${c.channelName}`,
          `- Подписчики: ${subs !== null ? subs.toLocaleString('ru-RU') : 'нет данных'}`,
          er24 ? `- ER24: ${er24}% | Охваты 24ч: ${views24h !== null ? views24h.toLocaleString('ru-RU') : '—'}` : '',
          avgCpf ? `- Ср. CPF: ${avgCpf}₽ | Прирост: ${growth !== null ? (growth >= 0 ? '+' : '') + growth.toLocaleString('ru-RU') : '—'}` : '',
          `- Доход: ${c.salesTotal}₽ (${c.salesCount} продаж) | Расход: ${c.purchasesTotal}₽ (${c.purchasesCount} закупок)`,
          `- Прибыль: ${c.profit}₽ | ROI: ${c.roi === Infinity ? '∞' : c.roi.toFixed(0)}%`,
          (c.unpaidSalesTotal > 0 || c.unpaidPurchasesTotal > 0)
            ? `- ⚠️ Неопл.: продажи ${c.unpaidSalesTotal}₽, закупки ${c.unpaidPurchasesTotal}₽`
            : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n');
      // Overall CPF stats
      const allCpfs = cpfData.filter(r => r.cpf !== null).map(r => r.cpf as number);
      const overallAvgCpf = allCpfs.length > 0 ? (allCpfs.reduce((s, v) => s + v, 0) / allCpfs.length).toFixed(2) : null;
      const totalSubsGrowth = cpfData.reduce((s, r) => s + r.growth, 0);
      const totalSubs = Array.from(latestSnap.values()).reduce((s, v) => s + (v.subscriberCount ?? 0), 0);
      const prompt = `Ты — эксперт по экономике рекламных каналов в Макс/Телеграм.

БИЗНЕС-МОДЕЛЬ:
Бизнес построен на закупе подписчиков (реклама в других каналах) и продаже рекламы в своих каналах. Ключевые метрики:
- CPF (стоимость подписчика) — сколько стоит привлечь 1 подписчика
- ER24 (вовлечённость) — качество аудитории, влияет на цену рекламы
- Охваты 24ч/48ч/72ч — база для расчёта СПМ (стоимость за 1000 просмотров)
- ROI — общая рентабельность

ОБЩИЕ ПОКАЗАТЕЛИ:
- Общий доход: ${data.totalSales}₽ (продаж: ${data.salesCount})
- Общий расход: ${data.totalPurchases}₽ (закупок: ${data.purchasesCount})
- Прибыль: ${data.totalProfit}₽ | ROI: ${data.overallROI.toFixed(1)}%
- Всего подписчиков: ${totalSubs.toLocaleString('ru-RU')}
- Прирост подписчиков (период): ${totalSubsGrowth >= 0 ? '+' : ''}${totalSubsGrowth.toLocaleString('ru-RU')}
${overallAvgCpf ? `- Средний CPF: ${overallAvgCpf}₽` : ''}

ПО КАНАЛАМ:
${channelsSummary}

ПРОАНАЛИЗИРУЙ И ОТВЕТЬ НА РУССКОМ. Дай:
1. Оценка состояния бизнеса: рост аудитории, CPF, ROI
2. Анализ цены подписчика: эффективен ли закуп, стоит ли увеличивать
3. Анализ ER24 и охватов: качество аудитории, влияние на цену рекламы
4. Рекомендации: сколько тратить на закуп, какие каналы приоритетны для роста
5. Риски и неоплаченные суммы
Формат: markdown с заголовками, цифрами, эмоджи. Максимум 600 слов.`;
      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Ты — AI-аналитик рекламного бизнеса в Макс/Телеграм. Анализируй через призму CPF + ER + охваты + ROI. Отвечай конкретно, с цифрами и действиями." },
          { role: "user", content: prompt },
        ],
      });
      const content = result.choices?.[0]?.message?.content;
      const analysis = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: { type: string; text?: string }) => p.type === "text" ? p.text : "").join("") : "";
      return { analysis, data };
    }),
    /** AI digest — weekly/monthly text summary */
  generateDigest: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const data = await getChannelProfitability(ctx.user.id, input.month);
      if (data.channels.length === 0) {
        return { digest: "Нет данных для дайджеста." };
      }

      const channelsList = data.channels.map(c =>
        `${c.channelName}: продажи ${c.salesTotal}₽ (${c.salesCount} шт), закупки ${c.purchasesTotal}₽ (${c.purchasesCount} шт), прибыль ${c.profit}₽`
      ).join('\n');

      const periodLabel = input.month ? `за ${input.month}` : 'за всё время';

      const prompt = `Составь краткий бизнес-дайджест ${periodLabel} для владельца рекламных каналов.

Общие цифры:
- Доход: ${data.totalSales}₽ (продаж: ${data.salesCount})
- Расход: ${data.totalPurchases}₽ (закупок: ${data.purchasesCount})
- Прибыль: ${data.totalProfit}₽
- ROI: ${data.overallROI.toFixed(1)}%
- Каналов: ${data.channelCount}

По каналам:
${channelsList}

Напиши на русском языке краткую сводку (200–300 слов) в формате markdown:
- Ключевые метрики периода
- Что выросло / упало
- Главные достижения
- Точки внимания и риски
- 2–3 приоритетных действия на следующий период

Стиль: деловой, но дружелюбный. Используй эмодзи для акцентов.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Ты — бизнес-аналитик, составляющий краткие и полезные дайджесты для владельцев рекламного бизнеса." },
          { role: "user", content: prompt },
        ],
      });

      const content = result.choices?.[0]?.message?.content;
      const digest = typeof content === "string" ? content : Array.isArray(content) ? content.map(p => p.type === "text" ? p.text : "").join("") : "";
      return { digest, data };
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
  partnerChannelName: z.string().min(1).max(255),
  partnerContact: z.string().max(255).optional(),
  dealDate: z.date().optional(),
  ourReach: z.number().int().optional(),
  partnerReach: z.number().int().optional(),
  dealType: z.enum(["без доплаты", "с доплатой"]).default("без доплаты"),
  dopDirection: z.enum(["мы платим", "нам платят"]).optional(),
  dopAmount: z.string().optional(),
  dopPaymentStatus: z.enum(["paid", "unpaid", "not_applicable"]).default("not_applicable"),
  ourPostLink: z.string().max(1024).optional(),
  partnerPostLink: z.string().max(1024).optional(),
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
      const id = await createMutualDeal({
        userId: ctx.user.id,
        ourChannelId: input.ourChannelId,
        partnerChannelName: input.partnerChannelName,
        partnerContact: input.partnerContact ?? null,
        dealDate: input.dealDate ?? null,
        ourReach: input.ourReach ?? null,
        partnerReach: input.partnerReach ?? null,
        dealType: input.dealType,
        dopDirection: input.dopDirection ?? null,
        dopAmount: input.dopAmount ?? null,
        dopPaymentStatus: input.dopPaymentStatus,
        ourPostLink: input.ourPostLink ?? null,
        partnerPostLink: input.partnerPostLink ?? null,
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
      await updateMutualDeal(id, ctx.user.id, data as any);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteMutualDeal(input.id, ctx.user.id);
      return { success: true };
    }),

  calcDoplate: protectedProcedure
    .input(z.object({
      ourReach: z.number().int(),
      partnerReach: z.number().int(),
      baseSpm: z.number().optional(),
    }))
    .query(({ input }) => calcRecommendedDoplate(input.ourReach, input.partnerReach, input.baseSpm)),
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
    .input(z.object({ channelIds: z.array(z.number().int().positive()).optional() }))
    .query(async ({ ctx, input }) => {
      const userChannels = await import("./db").then(m => m.getChannelsByUser(ctx.user.id));
      const ids = input.channelIds ?? userChannels.map((c: { id: number }) => c.id);
      return getCpfAnalytics(ctx.user.id, ids);
    }),

  sourceEfficiency: protectedProcedure
    .query(({ ctx }) => getSourceEfficiency(ctx.user.id)),
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
});

export type AppRouter = typeof appRouter;
