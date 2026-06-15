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
          lines.push(`- 👥 Подписчики: ${c.currentSubscribers.toLocaleString('ru-RU')}${c.weeklyGrowth != null ? ` (нед. прирост: ${c.weeklyGrowth >= 0 ? '+' : ''}${c.weeklyGrowth})` : ''}`);
        }
        if (c.er24 !== null) {
          lines.push(`- 📊 ER24: ${c.er24.toFixed(2)}% | Охваты: 24ч=${c.views24h ?? '—'}, 48ч=${c.views48h ?? '—'}, 72ч=${c.views72h ?? '—'}`);
        }
        // CPF & subscriber acquisition
        if (c.avgCpf !== null || c.subscribersGained > 0) {
          lines.push(`- 🎯 Привлечено подписчиков: ${c.subscribersGained > 0 ? '+' + c.subscribersGained.toLocaleString('ru-RU') : '—'} | Ср. CPF: ${c.avgCpf !== null ? c.avgCpf + '₽' : '—'}`);
        }
        // Financial
        lines.push(`- 💰 Доход: ${c.salesTotal.toLocaleString('ru-RU')}₽ (${c.salesCount} продаж) | Расход: ${c.purchasesTotal.toLocaleString('ru-RU')}₽ (${c.purchasesCount} закупок)`);
        lines.push(`- 📈 Прибыль: ${c.profit.toLocaleString('ru-RU')}₽ | ROI: ${c.roi === Infinity ? '∞' : c.roi.toFixed(0)}%`);
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
        return lines.join('\n');
      }).join('\n\n');

      const mutualBlock = ctx_data.mutual.total > 0 ? `
ВЗАИМКИ (ВП):
- Всего сделок: ${ctx_data.mutual.total} (завершено: ${ctx_data.mutual.completed}, активных: ${ctx_data.mutual.active})
- Доплатили партнёрам: ${ctx_data.mutual.totalDopPaid.toLocaleString('ru-RU')}₽
- Получили доплату: ${ctx_data.mutual.totalDopReceived.toLocaleString('ru-RU')}₽
${ctx_data.mutual.avgOurReach !== null ? `- Ср. наш охват в ВП: ${ctx_data.mutual.avgOurReach.toLocaleString('ru-RU')}` : ''}
${ctx_data.mutual.avgPartnerReach !== null ? `- Ср. охват партнёра: ${ctx_data.mutual.avgPartnerReach.toLocaleString('ru-RU')}` : ''}` : '';

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
- Расход: ${ctx_data.totalPurchases.toLocaleString('ru-RU')}₽ (${ctx_data.channels.reduce((s, c) => s + c.purchasesCount, 0)} закупок)
- Прибыль: ${ctx_data.totalProfit.toLocaleString('ru-RU')}₽ | ROI: ${ctx_data.overallROI.toFixed(1)}%
- Подписчиков сейчас: ${ctx_data.totalCurrentSubscribers.toLocaleString('ru-RU')}
- Привлечено за период: +${ctx_data.totalSubscribersGained.toLocaleString('ru-RU')}
${ctx_data.overallAvgCpf !== null ? `- Средний CPF: ${ctx_data.overallAvgCpf}₽` : ''}
${mutualBlock}

ПО КАНАЛАМ:
${channelsSummary}

ЗАДАНИЕ: Дай глубокий анализ на русском языке в формате markdown.
Структура ответа:
## 📊 Общая оценка бизнеса
(ROI, прибыль, тренд роста)

## 👥 Анализ закупа подписчиков
(CPF по каналам, эффективность ниш, тарифов, размеров источников, рекомендации по бюджету)

## 📈 Качество аудитории (ER и охваты)
(ER24 по каналам, связь с ценой рекламы, рекомендации)

## 💰 Анализ продаж
(платформы, охваты, ВП-сделки, доходность)

## ⚠️ Риски и задолженности
(неоплаченные суммы, слабые каналы)

## 🎯 Приоритетные действия (топ-3)
(конкретные, с цифрами)

Максимум 700 слов. Используй эмодзи для акцентов. Будь конкретен — называй каналы, цифры, ниши.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Ты — AI-аналитик рекламного бизнеса в Макс/Телеграм. Анализируй через призму CPF + ER + охваты + ROI + взаимки. Отвечай конкретно, с цифрами и действиями. Используй все предоставленные данные." },
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
          `**${c.channelName}**: доход ${c.salesTotal.toLocaleString('ru-RU')}₽ / расход ${c.purchasesTotal.toLocaleString('ru-RU')}₽ / прибыль ${c.profit.toLocaleString('ru-RU')}₽ / ROI ${c.roi === Infinity ? '∞' : c.roi.toFixed(0)}%`,
        ];
        if (c.currentSubscribers !== null) parts.push(`подписчики: ${c.currentSubscribers.toLocaleString('ru-RU')}${c.weeklyGrowth != null ? ` (${c.weeklyGrowth >= 0 ? '+' : ''}${c.weeklyGrowth} нед.)` : ''}`);
        if (c.avgCpf !== null) parts.push(`CPF: ${c.avgCpf}₽`);
        if (c.er24 !== null) parts.push(`ER24: ${c.er24.toFixed(1)}%`);
        if (c.topDirections.length > 0) parts.push(`ниши: ${c.topDirections.slice(0, 3).join(', ')}`);
        if (c.mutualSalesCount > 0) parts.push(`ВП: ${c.mutualSalesCount} шт.`);
        if (c.unpaidSalesTotal > 0 || c.unpaidPurchasesTotal > 0) parts.push(`⚠️ неопл.: ${(c.unpaidSalesTotal + c.unpaidPurchasesTotal).toLocaleString('ru-RU')}₽`);
        return parts.join(' | ');
      }).join('\n');

      const mutualLine = ctx_data.mutual.total > 0
        ? `\nВзаимки: ${ctx_data.mutual.total} сделок (завершено: ${ctx_data.mutual.completed}), доплата нам: ${ctx_data.mutual.totalDopReceived.toLocaleString('ru-RU')}₽`
        : '';

      const periodLabel = input.month ? `за ${input.month}` : 'за всё время';
      const prompt = `Составь краткий бизнес-дайджест ${periodLabel} для владельца рекламных каналов в Макс/Телеграм.

ДАННЫЕ:
- Доход: ${ctx_data.totalSales.toLocaleString('ru-RU')}₽ | Расход: ${ctx_data.totalPurchases.toLocaleString('ru-RU')}₽ | Прибыль: ${ctx_data.totalProfit.toLocaleString('ru-RU')}₽ | ROI: ${ctx_data.overallROI.toFixed(1)}%
- Подписчиков: ${ctx_data.totalCurrentSubscribers.toLocaleString('ru-RU')} | Привлечено: +${ctx_data.totalSubscribersGained.toLocaleString('ru-RU')}${ctx_data.overallAvgCpf !== null ? ` | Ср. CPF: ${ctx_data.overallAvgCpf}₽` : ''}${mutualLine}

По каналам:
${channelsList}

Напиши на русском языке краткую сводку (200–300 слов) в формате markdown:
- 🔑 Ключевые метрики периода (с цифрами)
- 📈 Что выросло / упало
- 🏆 Главные достижения
- ⚠️ Точки внимания и риски
- 🎯 2–3 приоритетных действия на следующий период

Стиль: деловой, конкретный, с цифрами. Используй эмодзи для акцентов.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Ты — бизнес-аналитик, составляющий краткие и полезные дайджесты для владельцев рекламного бизнеса в Макс/Телеграм." },
          { role: "user", content: prompt },
        ],
      });
      const content = result.choices?.[0]?.message?.content;
      const digest = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: { type: string; text?: string }) => p.type === "text" ? p.text : "").join("") : "";
      return { digest, data: ctx_data };
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
  // Per-side dates (replaces single dealDate)
  ourPostDate: z.date().optional(),
  partnerPostDate: z.date().optional(),
  ourBookingSlot: z.enum(["утро", "обед", "вечер"]).optional(),
  partnerBookingSlot: z.enum(["утро", "обед", "вечер"]).optional(),
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
          views24h: number | null;
          views48h: number | null;
          views72h: number | null;
          er24h: number | null;
          postedAt: string | null;
          postUrl: string | null;
        }> = (reportData.posts ?? []).map((p: any) => ({
          channelTitle: p.channel_title ?? null,
          channelSubs: p.channel_subs ?? null,
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

      // ── Generic URL fallback: fetch HTML and ask LLM to extract stats ─────
      let pageText = "";
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MaxAdsManager/1.0)" },
          signal: AbortSignal.timeout(10_000),
        });
        const html = await resp.text();
        // Strip tags, keep text
        pageText = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 6000);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Не удалось загрузить страницу: ${e.message}` });
      }

      const llmResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Ты — ассистент для извлечения статистики рекламных постов из текста страницы.
Извлеки данные и верни JSON. Если поле не найдено — верни null.
Поля:
- channelTitle: название канала (строка) или null
- channelSubs: количество подписчиков (число) или null
- views24h: просмотры за 24 часа (число) или null
- views48h: просмотры за 48 часов (число) или null
- views72h: просмотры за 72 часа (число) или null
- er24h: ER/ERR за 24 часа в процентах (число) или null
- postedAt: дата публикации ISO (строка) или null`,
          },
          {
            role: "user",
            content: `Текст страницы:\n${pageText}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "link_stats",
            strict: true,
            schema: {
              type: "object",
              properties: {
                channelTitle: { type: ["string", "null"] },
                channelSubs: { type: ["integer", "null"] },
                views24h: { type: ["integer", "null"] },
                views48h: { type: ["integer", "null"] },
                views72h: { type: ["integer", "null"] },
                er24h: { type: ["number", "null"] },
                postedAt: { type: ["string", "null"] },
              },
              required: ["channelTitle", "channelSubs", "views24h", "views48h", "views72h", "er24h", "postedAt"],
              additionalProperties: false,
            },
          },
        },
      });

      let extracted: any = {};
      try {
        extracted = JSON.parse(llmResult.choices[0].message.content as string);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось разобрать ответ AI" });
      }

      return {
        type: "generic" as const,
        draftName: null,
        publishedAt: extracted.postedAt ?? null,
        summary: {
          views24h: extracted.views24h ?? null,
          views48h: extracted.views48h ?? null,
          views72h: extracted.views72h ?? null,
          er24h: extracted.er24h ?? null,
          subscribersTotal: extracted.channelSubs ?? null,
        },
        posts: [{
          channelTitle: extracted.channelTitle ?? null,
          channelSubs: extracted.channelSubs ?? null,
          views24h: extracted.views24h ?? null,
          views48h: extracted.views48h ?? null,
          views72h: extracted.views72h ?? null,
          er24h: extracted.er24h ?? null,
          postedAt: extracted.postedAt ?? null,
          postUrl: url,
        }],
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
});

export type AppRouter = typeof appRouter;
