import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Channel,
  ChannelAssignment,
  InsertChannel,
  InsertChannelAssignment,
  InsertMutualDeal,
  InsertPurchaseRecord,
  InsertSaleRecord,
  InsertUser,
  MutualDeal,
  PurchaseRecord,
  SaleRecord,
  channelAssignments,
  channels,
  mutualDeals,
  purchaseRecords,
  saleRecords,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function getChannelsByUser(userId: number): Promise<Channel[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(channels)
    .where(eq(channels.userId, userId))
    .orderBy(channels.createdAt);
}

export async function getChannelById(id: number, userId: number): Promise<Channel | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, id), eq(channels.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createChannel(data: InsertChannel): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(channels).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateChannel(
  id: number,
  userId: number,
  data: Partial<Pick<InsertChannel, "name" | "description">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(channels)
    .set(data)
    .where(and(eq(channels.id, id), eq(channels.userId, userId)));
}

export async function deleteChannel(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(channels).where(and(eq(channels.id, id), eq(channels.userId, userId)));
}

// ─── Purchase Records ─────────────────────────────────────────────────────────

export async function getPurchaseRecords(
  userId: number,
  filters: { channelId?: number; month?: string; paymentStatus?: string }
): Promise<PurchaseRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(purchaseRecords.userId, userId)];
  if (filters.channelId) conditions.push(eq(purchaseRecords.channelId, filters.channelId));
  if (filters.month) conditions.push(eq(purchaseRecords.month, filters.month));
  if (filters.paymentStatus && ["paid", "unpaid", "partial"].includes(filters.paymentStatus)) {
    conditions.push(
      eq(
        purchaseRecords.paymentStatus,
        filters.paymentStatus as "paid" | "unpaid" | "partial"
      )
    );
  }

  return db
    .select()
    .from(purchaseRecords)
    .where(and(...conditions))
    .orderBy(desc(purchaseRecords.date));
}

export async function createPurchaseRecord(data: InsertPurchaseRecord): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(purchaseRecords).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updatePurchaseRecord(
  id: number,
  userId: number,
  data: Partial<InsertPurchaseRecord>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(purchaseRecords)
    .set(data)
    .where(and(eq(purchaseRecords.id, id), eq(purchaseRecords.userId, userId)));
}

export async function deletePurchaseRecord(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(purchaseRecords)
    .where(and(eq(purchaseRecords.id, id), eq(purchaseRecords.userId, userId)));
}

// ─── Sale Records ─────────────────────────────────────────────────────────────

export async function getSaleRecords(
  userId: number,
  filters: { channelId?: number; month?: string; paymentStatus?: string }
): Promise<SaleRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(saleRecords.userId, userId)];
  if (filters.channelId) conditions.push(eq(saleRecords.channelId, filters.channelId));
  if (filters.month) conditions.push(eq(saleRecords.month, filters.month));
  if (filters.paymentStatus && ["paid", "unpaid", "partial"].includes(filters.paymentStatus)) {
    conditions.push(
      eq(saleRecords.paymentStatus, filters.paymentStatus as "paid" | "unpaid" | "partial")
    );
  }

  return db
    .select()
    .from(saleRecords)
    .where(and(...conditions))
    .orderBy(desc(saleRecords.date));
}

export async function createSaleRecord(data: InsertSaleRecord): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(saleRecords).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateSaleRecord(
  id: number,
  userId: number,
  data: Partial<InsertSaleRecord>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(saleRecords)
    .set(data)
    .where(and(eq(saleRecords.id, id), eq(saleRecords.userId, userId)));
}

export async function deleteSaleRecord(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(saleRecords)
    .where(and(eq(saleRecords.id, id), eq(saleRecords.userId, userId)));
}

// ─── Financial Summaries ──────────────────────────────────────────────────────

export interface ChannelSummary {
  channelId: number;
  channelName: string;
  totalPurchaseCost: number;
  totalSaleRevenue: number;
  profit: number;
  purchaseCount: number;
  saleCount: number;
}

export async function getFinancialSummary(
  userId: number,
  month?: string
): Promise<ChannelSummary[]> {
  const db = await getDb();
  if (!db) return [];

  const userChannels = await getChannelsByUser(userId);
  if (userChannels.length === 0) return [];

  const summaries: ChannelSummary[] = [];

  for (const channel of userChannels) {
    const purchaseConditions = [
      eq(purchaseRecords.userId, userId),
      eq(purchaseRecords.channelId, channel.id),
    ];
    if (month) purchaseConditions.push(eq(purchaseRecords.month, month));

    const saleConditions = [
      eq(saleRecords.userId, userId),
      eq(saleRecords.channelId, channel.id),
    ];
    if (month) saleConditions.push(eq(saleRecords.month, month));

    const purchaseAgg = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(cost AS DECIMAL(12,2))), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(purchaseRecords)
      .where(and(...purchaseConditions));

    const saleAgg = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(cost AS DECIMAL(12,2))), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(saleRecords)
      .where(and(...saleConditions));

    const totalPurchaseCost = parseFloat(purchaseAgg[0]?.total ?? "0");
    const totalSaleRevenue = parseFloat(saleAgg[0]?.total ?? "0");

    summaries.push({
      channelId: channel.id,
      channelName: channel.name,
      totalPurchaseCost,
      totalSaleRevenue,
      profit: totalSaleRevenue - totalPurchaseCost,
      purchaseCount: Number(purchaseAgg[0]?.count ?? 0),
      saleCount: Number(saleAgg[0]?.count ?? 0),
    });
  }

  return summaries;
}

export async function getAvailableMonths(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const purchaseMonths = await db
    .selectDistinct({ month: purchaseRecords.month })
    .from(purchaseRecords)
    .where(eq(purchaseRecords.userId, userId));

  const saleMonths = await db
    .selectDistinct({ month: saleRecords.month })
    .from(saleRecords)
    .where(eq(saleRecords.userId, userId));

  const all = new Set([
    ...purchaseMonths.map((r) => r.month),
    ...saleMonths.map((r) => r.month),
  ]);

  return Array.from(all).sort().reverse();
}

// ─── Single-record lookups (for duplication) ─────────────────────────────────
export async function getPurchaseById(id: number, userId: number): Promise<PurchaseRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(purchaseRecords)
    .where(and(eq(purchaseRecords.id, id), eq(purchaseRecords.userId, userId)))
    .limit(1);
  return result[0];
}

export async function getSaleById(id: number, userId: number): Promise<SaleRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(saleRecords)
    .where(and(eq(saleRecords.id, id), eq(saleRecords.userId, userId)))
    .limit(1);
  return result[0];
}

// ─── Monthly stats for charts ─────────────────────────────────────────────────
export interface MonthlyStatPoint {
  month: string; // "2026-04"
  purchases: number;
  sales: number;
  profit: number;
}

export async function getMonthlyStats(
  userId: number,
  channelId?: number
): Promise<MonthlyStatPoint[]> {
  const db = await getDb();
  if (!db) return [];

  const purchaseConds: ReturnType<typeof eq>[] = [eq(purchaseRecords.userId, userId)];
  const saleConds: ReturnType<typeof eq>[] = [eq(saleRecords.userId, userId)];
  if (channelId) {
    purchaseConds.push(eq(purchaseRecords.channelId, channelId));
    saleConds.push(eq(saleRecords.channelId, channelId));
  }

  const purchaseByMonth = await db
    .select({
      month: purchaseRecords.month,
      total: sql<string>`COALESCE(SUM(CAST(${purchaseRecords.cost} AS DECIMAL(12,2))), 0)`,
    })
    .from(purchaseRecords)
    .where(and(...purchaseConds))
    .groupBy(purchaseRecords.month);

  const saleByMonth = await db
    .select({
      month: saleRecords.month,
      total: sql<string>`COALESCE(SUM(CAST(${saleRecords.cost} AS DECIMAL(12,2))), 0)`,
    })
    .from(saleRecords)
    .where(and(...saleConds))
    .groupBy(saleRecords.month);

  // Merge into a map
  const map = new Map<string, { purchases: number; sales: number }>();
  for (const row of purchaseByMonth) {
    const entry = map.get(row.month) ?? { purchases: 0, sales: 0 };
    entry.purchases = parseFloat(row.total);
    map.set(row.month, entry);
  }
  for (const row of saleByMonth) {
    const entry = map.get(row.month) ?? { purchases: 0, sales: 0 };
    entry.sales = parseFloat(row.total);
    map.set(row.month, entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { purchases, sales }]) => ({
      month,
      purchases,
      sales,
      profit: sales - purchases,
    }));
}

// ─── Unpaid debts per channel ─────────────────────────────────────────────────
export async function getUnpaidDebts(userId: number, channelId?: number, month?: string) {
  const db = await getDb();
  if (!db) return [];

  // Build purchase conditions
  const purchaseConds = [eq(purchaseRecords.userId, userId), eq(purchaseRecords.paymentStatus, "unpaid")];
  if (channelId) purchaseConds.push(eq(purchaseRecords.channelId, channelId));
  if (month) purchaseConds.push(eq(purchaseRecords.month, month));

  // Build sale conditions
  const saleConds = [eq(saleRecords.userId, userId), eq(saleRecords.paymentStatus, "unpaid")];
  if (channelId) saleConds.push(eq(saleRecords.channelId, channelId));
  if (month) saleConds.push(eq(saleRecords.month, month));

  // Unpaid purchases per channel
  const unpaidPurchases = await db
    .select({
      channelId: purchaseRecords.channelId,
      total: sql<string>`COALESCE(SUM(CAST(${purchaseRecords.cost} AS DECIMAL(12,2))), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(purchaseRecords)
    .where(and(...purchaseConds))
    .groupBy(purchaseRecords.channelId);

  // Unpaid sales per channel
  const unpaidSales = await db
    .select({
      channelId: saleRecords.channelId,
      total: sql<string>`COALESCE(SUM(CAST(${saleRecords.cost} AS DECIMAL(12,2))), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(saleRecords)
    .where(and(...saleConds))
    .groupBy(saleRecords.channelId);

  // Get channel names
  const userChannels = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.userId, userId));

  const channelMap = new Map(userChannels.map((c) => [c.id, c.name]));

  // Merge by channelId
  const map = new Map<number, { channelId: number; channelName: string; unpaidPurchases: number; unpaidSales: number; unpaidPurchaseCount: number; unpaidSaleCount: number }>();

  for (const row of unpaidPurchases) {
    const cid = row.channelId;
    const entry = map.get(cid) ?? { channelId: cid, channelName: channelMap.get(cid) ?? "—", unpaidPurchases: 0, unpaidSales: 0, unpaidPurchaseCount: 0, unpaidSaleCount: 0 };
    entry.unpaidPurchases = parseFloat(row.total);
    entry.unpaidPurchaseCount = parseInt(row.count);
    map.set(cid, entry);
  }
  for (const row of unpaidSales) {
    const cid = row.channelId;
    const entry = map.get(cid) ?? { channelId: cid, channelName: channelMap.get(cid) ?? "—", unpaidPurchases: 0, unpaidSales: 0, unpaidPurchaseCount: 0, unpaidSaleCount: 0 };
    entry.unpaidSales = parseFloat(row.total);
    entry.unpaidSaleCount = parseInt(row.count);
    map.set(cid, entry);
  }

  return Array.from(map.values()).filter(
    (e) => e.unpaidPurchases > 0 || e.unpaidSales > 0
  );
}

// ─── Autocomplete suggestions ─────────────────────────────────────────────────
export async function getAutocompleteSuggestions(userId: number) {
  const db = await getDb();
  if (!db) return { admins: [], directions: [], buyers: [], platforms: [] };

  const [purchaseRows, saleRows] = await Promise.all([
    db
      .select({ admin: purchaseRecords.admin, direction: purchaseRecords.direction, buyer: purchaseRecords.buyer })
      .from(purchaseRecords)
      .where(eq(purchaseRecords.userId, userId))
      .orderBy(desc(purchaseRecords.createdAt))
      .limit(200),
    db
      .select({ admin: saleRecords.admin, platform: saleRecords.platform })
      .from(saleRecords)
      .where(eq(saleRecords.userId, userId))
      .orderBy(desc(saleRecords.createdAt))
      .limit(200),
  ]);

  const unique = <T>(arr: (T | null | undefined)[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const v of arr) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s === "" || seen.has(s)) continue;
      seen.add(s);
      result.push(s);
    }
    return result;
  };

  return {
    admins: unique([...purchaseRows.map((r) => r.admin), ...saleRows.map((r) => r.admin)]),
    directions: unique(purchaseRows.map((r) => r.direction)),
    buyers: unique(purchaseRows.map((r) => r.buyer)),
    platforms: unique(saleRows.map((r) => r.platform)),
  };
}

// ─── Schedule / Booking Calendar ─────────────────────────────────────────────
export async function getScheduleData(
  userId: number,
  startDate: string,
  endDate: string
): Promise<{
  sales: Array<Pick<SaleRecord, "id" | "channelId" | "date" | "timeSlot" | "bookingSlot" | "admin" | "cost" | "paymentStatus" | "link" | "tariff" | "postNotNeeded" | "isMutual" | "partnerChannel" | "dopDirection" | "dopAmount">>;
  purchases: Array<Pick<PurchaseRecord, "id" | "channelId" | "date" | "admin" | "cost" | "paymentStatus" | "bookingSlot" | "timeSlot">>;
  mutuals: Array<Pick<MutualDeal, "id" | "ourChannelId" | "dealDate" | "partnerChannelName" | "dealType" | "dopDirection" | "dopAmount" | "status" | "ourPostLink">>;
}> {
  const db = await getDb();
  if (!db) return { sales: [], purchases: [], mutuals: [] };

  const [sales, purchases, mutuals] = await Promise.all([
    db
      .select({
        id: saleRecords.id,
        channelId: saleRecords.channelId,
        date: saleRecords.date,
        timeSlot: saleRecords.timeSlot,
        bookingSlot: saleRecords.bookingSlot,
        admin: saleRecords.admin,
        cost: saleRecords.cost,
        paymentStatus: saleRecords.paymentStatus,
        link: saleRecords.link,
        tariff: saleRecords.tariff,
        postNotNeeded: saleRecords.postNotNeeded,
        isMutual: saleRecords.isMutual,
        partnerChannel: saleRecords.partnerChannel,
        dopDirection: saleRecords.dopDirection,
        dopAmount: saleRecords.dopAmount,
      })
      .from(saleRecords)
      .where(
        and(
          eq(saleRecords.userId, userId),
          sql`DATE(${saleRecords.date}) >= ${startDate}`,
          sql`DATE(${saleRecords.date}) <= ${endDate}`
        )
      )
      .orderBy(saleRecords.date),
    db
      .select({
        id: purchaseRecords.id,
        channelId: purchaseRecords.channelId,
        date: purchaseRecords.date,
        admin: purchaseRecords.admin,
        cost: purchaseRecords.cost,
        paymentStatus: purchaseRecords.paymentStatus,
        bookingSlot: purchaseRecords.bookingSlot,
        timeSlot: purchaseRecords.timeSlot,
      })
      .from(purchaseRecords)
      .where(
        and(
          eq(purchaseRecords.userId, userId),
          sql`DATE(${purchaseRecords.date}) >= ${startDate}`,
          sql`DATE(${purchaseRecords.date}) <= ${endDate}`
        )
      )
      .orderBy(purchaseRecords.date),
    db
      .select({
        id: mutualDeals.id,
        ourChannelId: mutualDeals.ourChannelId,
        dealDate: mutualDeals.dealDate,
        partnerChannelName: mutualDeals.partnerChannelName,
        dealType: mutualDeals.dealType,
        dopDirection: mutualDeals.dopDirection,
        dopAmount: mutualDeals.dopAmount,
        status: mutualDeals.status,
        ourPostLink: mutualDeals.ourPostLink,
      })
      .from(mutualDeals)
      .where(
        and(
          eq(mutualDeals.userId, userId),
          sql`DATE(${mutualDeals.dealDate}) >= ${startDate}`,
          sql`DATE(${mutualDeals.dealDate}) <= ${endDate}`
        )
      )
      .orderBy(mutualDeals.dealDate),
  ]);

  return { sales, purchases, mutuals };
}

/** Check if a booking slot is already taken for a given channel/date/bookingSlot.
 * Returns the conflicting record id if found, or null if free.
 * Pass excludeId to ignore a specific record (for update operations).
 */
export async function checkBookingConflict(
  userId: number,
  channelId: number,
  date: string, // YYYY-MM-DD
  bookingSlot: "утро" | "обед" | "вечер",
  excludeId?: number
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: saleRecords.id })
    .from(saleRecords)
    .where(
      and(
        eq(saleRecords.userId, userId),
        eq(saleRecords.channelId, channelId),
        sql`DATE(${saleRecords.date}) = ${date}`,
        eq(saleRecords.bookingSlot, bookingSlot)
      )
    )
    .limit(2);
  const filtered = excludeId ? rows.filter((r) => r.id !== excludeId) : rows;
  return filtered.length > 0 ? filtered[0].id : null;
}

// ─── AI Analytics: Channel Profitability Aggregation ─────────────────────────
export interface ChannelProfitData {
  channelId: number;
  channelName: string;
  salesTotal: number;
  salesCount: number;
  purchasesTotal: number;
  purchasesCount: number;
  profit: number;
  roi: number; // (sales - purchases) / purchases * 100, or Infinity if no purchases
  avgSaleCost: number;
  avgPurchaseCost: number;
  unpaidSalesTotal: number;
  unpaidPurchasesTotal: number;
}

export interface PeriodSummaryData {
  totalSales: number;
  totalPurchases: number;
  totalProfit: number;
  overallROI: number;
  channelCount: number;
  salesCount: number;
  purchasesCount: number;
  channels: ChannelProfitData[];
  topChannel: string | null;
  worstChannel: string | null;
}

export async function getChannelProfitability(
  userId: number,
  month?: string // e.g. "2026-05" or undefined for all-time
): Promise<PeriodSummaryData> {
  const db = await getDb();
  if (!db) {
    return {
      totalSales: 0, totalPurchases: 0, totalProfit: 0, overallROI: 0,
      channelCount: 0, salesCount: 0, purchasesCount: 0, channels: [],
      topChannel: null, worstChannel: null,
    };
  }

  // Get user channels
  const userChannels = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.userId, userId));
  const channelMap = new Map(userChannels.map((c) => [c.id, c.name]));

  // Sales aggregation per channel
  const saleConds: any[] = [eq(saleRecords.userId, userId)];
  if (month) saleConds.push(eq(saleRecords.month, month));

  const salesByChannel = await db
    .select({
      channelId: saleRecords.channelId,
      total: sql<string>`COALESCE(SUM(CAST(${saleRecords.cost} AS DECIMAL(12,2))), 0)`,
      count: sql<string>`COUNT(*)`,
      unpaid: sql<string>`COALESCE(SUM(CASE WHEN ${saleRecords.paymentStatus} != 'paid' THEN CAST(${saleRecords.cost} AS DECIMAL(12,2)) ELSE 0 END), 0)`,
    })
    .from(saleRecords)
    .where(and(...saleConds))
    .groupBy(saleRecords.channelId);

  // Purchases aggregation per channel
  const purchaseConds: any[] = [eq(purchaseRecords.userId, userId)];
  if (month) purchaseConds.push(eq(purchaseRecords.month, month));

  const purchasesByChannel = await db
    .select({
      channelId: purchaseRecords.channelId,
      total: sql<string>`COALESCE(SUM(CAST(${purchaseRecords.cost} AS DECIMAL(12,2))), 0)`,
      count: sql<string>`COUNT(*)`,
      unpaid: sql<string>`COALESCE(SUM(CASE WHEN ${purchaseRecords.paymentStatus} != 'paid' THEN CAST(${purchaseRecords.cost} AS DECIMAL(12,2)) ELSE 0 END), 0)`,
    })
    .from(purchaseRecords)
    .where(and(...purchaseConds))
    .groupBy(purchaseRecords.channelId);

  // Build per-channel data
  const channelDataMap = new Map<number, ChannelProfitData>();

  for (const row of salesByChannel) {
    const cid = row.channelId;
    const entry = channelDataMap.get(cid) ?? {
      channelId: cid, channelName: channelMap.get(cid) ?? "—",
      salesTotal: 0, salesCount: 0, purchasesTotal: 0, purchasesCount: 0,
      profit: 0, roi: 0, avgSaleCost: 0, avgPurchaseCost: 0,
      unpaidSalesTotal: 0, unpaidPurchasesTotal: 0,
    };
    entry.salesTotal = parseFloat(row.total);
    entry.salesCount = parseInt(row.count);
    entry.unpaidSalesTotal = parseFloat(row.unpaid);
    entry.avgSaleCost = entry.salesCount > 0 ? entry.salesTotal / entry.salesCount : 0;
    channelDataMap.set(cid, entry);
  }

  for (const row of purchasesByChannel) {
    const cid = row.channelId;
    const entry = channelDataMap.get(cid) ?? {
      channelId: cid, channelName: channelMap.get(cid) ?? "—",
      salesTotal: 0, salesCount: 0, purchasesTotal: 0, purchasesCount: 0,
      profit: 0, roi: 0, avgSaleCost: 0, avgPurchaseCost: 0,
      unpaidSalesTotal: 0, unpaidPurchasesTotal: 0,
    };
    entry.purchasesTotal = parseFloat(row.total);
    entry.purchasesCount = parseInt(row.count);
    entry.unpaidPurchasesTotal = parseFloat(row.unpaid);
    entry.avgPurchaseCost = entry.purchasesCount > 0 ? entry.purchasesTotal / entry.purchasesCount : 0;
    channelDataMap.set(cid, entry);
  }

  // Calculate profit and ROI
  const channelsData: ChannelProfitData[] = [];
  for (const entry of Array.from(channelDataMap.values())) {
    entry.profit = entry.salesTotal - entry.purchasesTotal;
    entry.roi = entry.purchasesTotal > 0
      ? ((entry.salesTotal - entry.purchasesTotal) / entry.purchasesTotal) * 100
      : (entry.salesTotal > 0 ? Infinity : 0);
    channelsData.push(entry);
  }

  // Sort by profit descending
  channelsData.sort((a, b) => b.profit - a.profit);

  const totalSales = channelsData.reduce((s, c) => s + c.salesTotal, 0);
  const totalPurchases = channelsData.reduce((s, c) => s + c.purchasesTotal, 0);
  const totalProfit = totalSales - totalPurchases;
  const overallROI = totalPurchases > 0 ? ((totalSales - totalPurchases) / totalPurchases) * 100 : 0;
  const salesCount = channelsData.reduce((s, c) => s + c.salesCount, 0);
  const purchasesCount = channelsData.reduce((s, c) => s + c.purchasesCount, 0);

  const topChannel = channelsData.length > 0 ? channelsData[0].channelName : null;
  const worstChannel = channelsData.length > 1 ? channelsData[channelsData.length - 1].channelName : null;

  return {
    totalSales, totalPurchases, totalProfit, overallROI,
    channelCount: channelsData.length, salesCount, purchasesCount,
    channels: channelsData, topChannel, worstChannel,
  };
}

// ─── Admin: Team Management ──────────────────────────────────────────────────

/** Get all users (for admin panel) */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

/** Update user role */
export async function updateUserRole(userId: number, role: "user" | "admin" | "buyer" | "manager") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/** Delete a user (and their assignments) */
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(channelAssignments).where(eq(channelAssignments.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ─── Admin: Channel Assignments ──────────────────────────────────────────────

/** Get all channel assignments (with user and channel names) */
export async function getChannelAssignments() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: channelAssignments.id,
      userId: channelAssignments.userId,
      channelId: channelAssignments.channelId,
      assignedBy: channelAssignments.assignedBy,
      createdAt: channelAssignments.createdAt,
      userName: users.name,
      userRole: users.role,
      channelName: channels.name,
    })
    .from(channelAssignments)
    .innerJoin(users, eq(channelAssignments.userId, users.id))
    .innerJoin(channels, eq(channelAssignments.channelId, channels.id))
    .orderBy(desc(channelAssignments.createdAt));
  return rows;
}

/** Get assignments for a specific user */
export async function getUserAssignments(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: channelAssignments.id,
      channelId: channelAssignments.channelId,
      channelName: channels.name,
    })
    .from(channelAssignments)
    .innerJoin(channels, eq(channelAssignments.channelId, channels.id))
    .where(eq(channelAssignments.userId, userId));
}

/** Assign channels to a user (replaces all existing assignments) */
export async function setUserChannelAssignments(userId: number, channelIds: number[], assignedBy: number) {
  const db = await getDb();
  if (!db) return;
  // Remove existing assignments
  await db.delete(channelAssignments).where(eq(channelAssignments.userId, userId));
  // Insert new assignments
  if (channelIds.length > 0) {
    await db.insert(channelAssignments).values(
      channelIds.map((channelId) => ({ userId, channelId, assignedBy }))
    );
  }
}

/** Delete a single assignment */
export async function deleteChannelAssignment(assignmentId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(channelAssignments).where(eq(channelAssignments.id, assignmentId));
}

/** Get channel IDs assigned to a user (for filtering) */
export async function getAssignedChannelIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ channelId: channelAssignments.channelId })
    .from(channelAssignments)
    .where(eq(channelAssignments.userId, userId));
  return rows.map((r) => r.channelId);
}

/** Get all channels (admin-level, across all users) */
export async function getAllChannels() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: channels.id,
      userId: channels.userId,
      name: channels.name,
      description: channels.description,
    })
    .from(channels)
    .orderBy(channels.name);
}

// ─── Mutual Deals (Взаимки) ───────────────────────────────────────────────────

export async function getMutualDeals(userId: number, filters: {
  month?: string;
  status?: string;
  ourChannelId?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(mutualDeals)
    .where(eq(mutualDeals.userId, userId))
    .orderBy(desc(mutualDeals.createdAt));

  return rows.filter((r) => {
    if (filters.month && r.month !== filters.month) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.ourChannelId && r.ourChannelId !== filters.ourChannelId) return false;
    return true;
  });
}

export async function getMutualDealById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(mutualDeals)
    .where(and(eq(mutualDeals.id, id), eq(mutualDeals.userId, userId)));
  return rows[0] ?? null;
}

export async function createMutualDeal(data: InsertMutualDeal): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(mutualDeals).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateMutualDeal(id: number, userId: number, data: Partial<InsertMutualDeal>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(mutualDeals)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(mutualDeals.id, id), eq(mutualDeals.userId, userId)));
}

export async function deleteMutualDeal(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(mutualDeals)
    .where(and(eq(mutualDeals.id, id), eq(mutualDeals.userId, userId)));
}

/** Calculate recommended doplate amount based on reach difference */
export function calcRecommendedDoplate(ourReach: number, partnerReach: number, baseSpm: number = 1000): {
  diff: number;
  direction: "мы платим" | "нам платят" | null;
  recommendedAmount: number;
} {
  const diff = ourReach - partnerReach;
  if (diff === 0) return { diff: 0, direction: null, recommendedAmount: 0 };
  // direction: if our reach is bigger, partner should pay us; if smaller, we pay them
  const direction: "мы платим" | "нам платят" = diff > 0 ? "нам платят" : "мы платим";
  const absDiff = Math.abs(diff);
  // recommended amount = (reach difference / 1000) * baseSpm
  const recommendedAmount = Math.round((absDiff / 1000) * baseSpm);
  return { diff, direction, recommendedAmount };
}

// ─── Subscriber Snapshots ─────────────────────────────────────────────────────

import {
  ChannelSubscriberSnapshot,
  InsertChannelSubscriberSnapshot,
  channelSubscriberSnapshots,
} from "../drizzle/schema";

/** List all subscriber snapshots for a user, optionally filtered by channelId */
export async function listSubscriberSnapshots(
  userId: number,
  channelId?: number
): Promise<ChannelSubscriberSnapshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(channelSubscriberSnapshots.userId, userId)];
  if (channelId !== undefined) {
    conditions.push(eq(channelSubscriberSnapshots.channelId, channelId));
  }
  return db
    .select()
    .from(channelSubscriberSnapshots)
    .where(and(...conditions))
    .orderBy(channelSubscriberSnapshots.snapshotDate);
}

/** Upsert a weekly snapshot — if one exists for the same channel+week, update it */
export async function upsertSubscriberSnapshot(
  data: InsertChannelSubscriberSnapshot
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Determine week start (Monday) for the given snapshotDate
  const d = new Date(data.snapshotDate);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1 - day);
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Check if snapshot already exists for this channel+week
  const existing = await db
    .select({ id: channelSubscriberSnapshots.id })
    .from(channelSubscriberSnapshots)
    .where(
      and(
        eq(channelSubscriberSnapshots.userId, data.userId),
        eq(channelSubscriberSnapshots.channelId, data.channelId),
        sql`${channelSubscriberSnapshots.snapshotDate} >= ${weekStart.toISOString().slice(0, 19).replace("T", " ")}`,
        sql`${channelSubscriberSnapshots.snapshotDate} < ${weekEnd.toISOString().slice(0, 19).replace("T", " ")}`
      )
    );

  if (existing.length > 0) {
    await db
      .update(channelSubscriberSnapshots)
      .set({
        subscriberCount: data.subscriberCount,
        snapshotDate: data.snapshotDate,
        notes: data.notes,
        views24h: data.views24h ?? null,
        views48h: data.views48h ?? null,
        views72h: data.views72h ?? null,
        er24: data.er24 ?? null,
        weeklyGrowth: data.weeklyGrowth ?? null,
      })
      .where(eq(channelSubscriberSnapshots.id, existing[0].id));
  } else {
    await db.insert(channelSubscriberSnapshots).values(data);
  }
}

/** Delete a subscriber snapshot by id */
export async function deleteSubscriberSnapshot(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(channelSubscriberSnapshots)
    .where(
      and(
        eq(channelSubscriberSnapshots.id, id),
        eq(channelSubscriberSnapshots.userId, userId)
      )
    );
}

export type CpfWeekData = {
  weekLabel: string; // e.g. "2026-W20"
  weekStart: string; // ISO date
  channelId: number;
  channelName: string;
  subscribersBefore: number;
  subscribersAfter: number;
  growth: number;
  purchaseCost: number; // total spend on purchases that week
  cpf: number | null; // cost per follower (null if no growth)
  // Trustat metrics from the "after" snapshot
  views24h: number | null;
  views48h: number | null;
  views72h: number | null;
  er24: number | null; // ER24 percentage
  weeklyGrowth: number | null; // from snapshot field (can differ from computed growth)
};

/** Calculate CPF (Cost Per Follower) analytics per channel per week */
export async function getCpfAnalytics(
  userId: number,
  channelIds: number[]
): Promise<CpfWeekData[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all snapshots for these channels
  const snapshots = await db
    .select()
    .from(channelSubscriberSnapshots)
    .where(
      and(
        eq(channelSubscriberSnapshots.userId, userId),
        channelIds.length > 0
          ? sql`${channelSubscriberSnapshots.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`
          : sql`1=1`
      )
    )
    .orderBy(channelSubscriberSnapshots.channelId, channelSubscriberSnapshots.snapshotDate);

  // Get all purchases for these channels
  const purchases = await db
    .select({
      channelId: purchaseRecords.channelId,
      date: purchaseRecords.date,
      cost: purchaseRecords.cost,
    })
    .from(purchaseRecords)
    .where(
      and(
        eq(purchaseRecords.userId, userId),
        channelIds.length > 0
          ? sql`${purchaseRecords.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`
          : sql`1=1`
      )
    );

  // Get channel names
  const channelList = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.userId, userId));
  const channelNameMap = new Map(channelList.map(c => [c.id, c.name]));

  const result: CpfWeekData[] = [];

  // Group snapshots by channelId
  const snapshotsByChannel = new Map<number, ChannelSubscriberSnapshot[]>();
  for (const snap of snapshots) {
    if (!snapshotsByChannel.has(snap.channelId)) {
      snapshotsByChannel.set(snap.channelId, []);
    }
    snapshotsByChannel.get(snap.channelId)!.push(snap);
  }

  for (const [channelId, channelSnaps] of Array.from(snapshotsByChannel)) {
    // For each consecutive pair of snapshots, calculate growth and CPF
    for (let i = 1; i < channelSnaps.length; i++) {
      const prev = channelSnaps[i - 1];
      const curr = channelSnaps[i];
      const growth = (curr.subscriberCount ?? 0) - (prev.subscriberCount ?? 0);

      // Week label based on curr snapshot date
      const d = new Date(curr.snapshotDate);
      const weekNum = getISOWeek(d);
      const weekLabel = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

      // Sum purchases between prev and curr snapshot dates
      const weekPurchases = purchases.filter(p => {
        if (p.channelId !== channelId) return false;
        const pd = new Date(p.date);
        return pd >= new Date(prev.snapshotDate) && pd < new Date(curr.snapshotDate);
      });
      const purchaseCost = weekPurchases.reduce((sum, p) => sum + parseFloat(p.cost ?? "0"), 0);

      result.push({
        weekLabel,
        weekStart: new Date(curr.snapshotDate).toISOString().slice(0, 10),
        channelId,
        channelName: channelNameMap.get(channelId) ?? `Канал ${channelId}`,
        subscribersBefore: prev.subscriberCount ?? 0,
        subscribersAfter: curr.subscriberCount ?? 0,
        growth,
        purchaseCost,
        cpf: growth > 0 ? Math.round((purchaseCost / growth) * 100) / 100 : null,
        views24h: curr.views24h ?? null,
        views48h: curr.views48h ?? null,
        views72h: curr.views72h ?? null,
        er24: curr.er24 !== null && curr.er24 !== undefined ? parseFloat(String(curr.er24)) : null,
        weeklyGrowth: curr.weeklyGrowth ?? null,
      });
    }
  }

  return result.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export type SourceEfficiencyData = {
  sizeCategory: string; // "micro (<10k)", "small (10k-50k)", "medium (50k-200k)", "large (200k+)"
  avgCpf: number | null;
  totalPurchases: number;
  totalCost: number;
  totalSubscribersGained: number;
};

/** Analyze purchase efficiency by source channel size */
export async function getSourceEfficiency(userId: number): Promise<SourceEfficiencyData[]> {
  const db = await getDb();
  if (!db) return [];

  const records = await db
    .select({
      sourceSubscribers: purchaseRecords.sourceSubscribers,
      cost: purchaseRecords.cost,
      subscribersGained: purchaseRecords.subscribersGained,
    })
    .from(purchaseRecords)
    .where(
      and(
        eq(purchaseRecords.userId, userId),
        sql`${purchaseRecords.sourceSubscribers} IS NOT NULL`
      )
    );

  const categories: Record<string, { costs: number[]; gained: number[]; count: number }> = {
    "micro (<10k)": { costs: [], gained: [], count: 0 },
    "small (10k-50k)": { costs: [], gained: [], count: 0 },
    "medium (50k-200k)": { costs: [], gained: [], count: 0 },
    "large (200k+)": { costs: [], gained: [], count: 0 },
  };

  for (const r of records) {
    const subs = r.sourceSubscribers ?? 0;
    const cat =
      subs < 10000 ? "micro (<10k)" :
      subs < 50000 ? "small (10k-50k)" :
      subs < 200000 ? "medium (50k-200k)" : "large (200k+)";
    categories[cat].costs.push(parseFloat(r.cost ?? "0"));
    categories[cat].gained.push(r.subscribersGained ?? 0);
    categories[cat].count++;
  }

  return Object.entries(categories).map(([sizeCategory, data]) => {
    const totalCost = data.costs.reduce((s, v) => s + v, 0);
    const totalGained = data.gained.reduce((s, v) => s + v, 0);
    return {
      sizeCategory,
      avgCpf: totalGained > 0 ? Math.round((totalCost / totalGained) * 100) / 100 : null,
      totalPurchases: data.count,
      totalCost,
      totalSubscribersGained: totalGained,
    };
  }).filter(d => d.totalPurchases > 0);
}

// ─── AI Context: full data aggregation for AI analysis ───────────────────────
export interface AiChannelData {
  channelId: number;
  channelName: string;
  // Financial
  salesTotal: number;
  salesCount: number;
  purchasesTotal: number;
  purchasesCount: number;
  profit: number;
  roi: number;
  unpaidSalesTotal: number;
  unpaidPurchasesTotal: number;
  // Subscriber metrics
  currentSubscribers: number | null;
  subscribersGained: number; // total from purchase records
  avgCpf: number | null; // cost per follower
  er24: number | null;
  views24h: number | null;
  views48h: number | null;
  views72h: number | null;
  weeklyGrowth: number | null;
  // Purchase breakdown
  topDirections: string[]; // top niches
  topTariffs: string[]; // top tariffs used
  avgPurchaseReach: number | null;
  avgSpm: number | null; // avg SPM across purchases
  botStoriesPurchaseCost: number; // total bot/stories cost in purchases
  avgSourceSubscribers: number | null; // avg size of source channels
  // Sale breakdown
  platforms: string[]; // unique platforms
  avgSaleReach: number | null;
  mutualSalesCount: number; // isMutual=true sales
  mutualSalesRevenue: number;
  botStoriesSaleCost: number;
  avgBuyerSubscribers: number | null;
}

export interface AiMutualDealSummary {
  total: number;
  completed: number;
  active: number; // agreed/placed
  totalDopPaid: number; // we paid doplate
  totalDopReceived: number; // they paid us
  avgOurReach: number | null;
  avgPartnerReach: number | null;
}

export interface AiContext {
  month: string | null;
  channels: AiChannelData[];
  mutual: AiMutualDealSummary;
  // Aggregated totals
  totalSales: number;
  totalPurchases: number;
  totalProfit: number;
  overallROI: number;
  totalSubscribersGained: number;
  totalCurrentSubscribers: number;
  overallAvgCpf: number | null;
}

export async function getAiContext(userId: number, month?: string): Promise<AiContext> {
  const db = await getDb();
  const empty: AiContext = {
    month: month ?? null,
    channels: [],
    mutual: { total: 0, completed: 0, active: 0, totalDopPaid: 0, totalDopReceived: 0, avgOurReach: null, avgPartnerReach: null },
    totalSales: 0, totalPurchases: 0, totalProfit: 0, overallROI: 0,
    totalSubscribersGained: 0, totalCurrentSubscribers: 0, overallAvgCpf: null,
  };
  if (!db) return empty;

  // ── Channels ──────────────────────────────────────────────────────────────
  const userChannels = await db.select({ id: channels.id, name: channels.name })
    .from(channels).where(eq(channels.userId, userId));
  const channelMap = new Map(userChannels.map((c) => [c.id, c.name]));

  // ── Sales ─────────────────────────────────────────────────────────────────
  const saleConds: any[] = [eq(saleRecords.userId, userId)];
  if (month) saleConds.push(eq(saleRecords.month, month));
  const allSales = await db.select().from(saleRecords).where(and(...saleConds));

  // ── Purchases ─────────────────────────────────────────────────────────────
  const purchaseConds: any[] = [eq(purchaseRecords.userId, userId)];
  if (month) purchaseConds.push(eq(purchaseRecords.month, month));
  const allPurchases = await db.select().from(purchaseRecords).where(and(...purchaseConds));

  // ── Snapshots (latest per channel) ────────────────────────────────────────
  const allSnaps = await db.select().from(channelSubscriberSnapshots)
    .where(eq(channelSubscriberSnapshots.userId, userId));
  const latestSnap = new Map<number, typeof allSnaps[0]>();
  for (const s of allSnaps) {
    const ex = latestSnap.get(s.channelId);
    if (!ex || new Date(s.snapshotDate) > new Date(ex.snapshotDate)) {
      latestSnap.set(s.channelId, s);
    }
  }

  // ── CPF analytics ─────────────────────────────────────────────────────────
  const cpfRows = await getCpfAnalytics(userId, userChannels.map(c => c.id));
  const cpfByChannel = new Map<number, { cpfs: number[]; totalGrowth: number }>();
  for (const row of cpfRows) {
    if (!cpfByChannel.has(row.channelId)) cpfByChannel.set(row.channelId, { cpfs: [], totalGrowth: 0 });
    const e = cpfByChannel.get(row.channelId)!;
    if (row.cpf !== null) e.cpfs.push(row.cpf);
    e.totalGrowth += row.growth;
  }

  // ── Mutual deals ──────────────────────────────────────────────────────────
  const mutualFilters: { month?: string } = {};
  if (month) mutualFilters.month = month;
  const allMutual = await getMutualDeals(userId, mutualFilters);
  const mutualSummary: AiMutualDealSummary = {
    total: allMutual.length,
    completed: allMutual.filter(m => m.status === "завершено").length,
    active: allMutual.filter(m => ["согласовано", "размещено"].includes(m.status)).length,
    totalDopPaid: allMutual
      .filter(m => m.dopDirection === "мы платим" && m.dopAmount)
      .reduce((s, m) => s + parseFloat(String(m.dopAmount ?? 0)), 0),
    totalDopReceived: allMutual
      .filter(m => m.dopDirection === "нам платят" && m.dopAmount)
      .reduce((s, m) => s + parseFloat(String(m.dopAmount ?? 0)), 0),
    avgOurReach: (() => {
      const vals = allMutual.filter(m => m.ourReach != null).map(m => m.ourReach as number);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })(),
    avgPartnerReach: (() => {
      const vals = allMutual.filter(m => m.partnerReach != null).map(m => m.partnerReach as number);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })(),
  };

  // ── Build per-channel data ─────────────────────────────────────────────────
  const channelDataMap = new Map<number, AiChannelData>();
  const initChannel = (cid: number): AiChannelData => ({
    channelId: cid, channelName: channelMap.get(cid) ?? "—",
    salesTotal: 0, salesCount: 0, purchasesTotal: 0, purchasesCount: 0,
    profit: 0, roi: 0, unpaidSalesTotal: 0, unpaidPurchasesTotal: 0,
    currentSubscribers: null, subscribersGained: 0, avgCpf: null,
    er24: null, views24h: null, views48h: null, views72h: null, weeklyGrowth: null,
    topDirections: [], topTariffs: [], avgPurchaseReach: null, avgSpm: null,
    botStoriesPurchaseCost: 0, avgSourceSubscribers: null,
    platforms: [], avgSaleReach: null, mutualSalesCount: 0, mutualSalesRevenue: 0,
    botStoriesSaleCost: 0, avgBuyerSubscribers: null,
  });

  // Process sales
  for (const s of allSales) {
    const cid = s.channelId;
    if (!channelDataMap.has(cid)) channelDataMap.set(cid, initChannel(cid));
    const e = channelDataMap.get(cid)!;
    const cost = parseFloat(String(s.cost ?? 0));
    e.salesTotal += cost;
    e.salesCount += 1;
    if (s.paymentStatus !== "paid") e.unpaidSalesTotal += cost;
    if (s.platform && !e.platforms.includes(s.platform)) e.platforms.push(s.platform);
    if (s.botStoriesCost) e.botStoriesSaleCost += parseFloat(String(s.botStoriesCost));
    if (s.isMutual) { e.mutualSalesCount += 1; e.mutualSalesRevenue += cost; }
  }

  // Process purchases
  for (const p of allPurchases) {
    const cid = p.channelId;
    if (!channelDataMap.has(cid)) channelDataMap.set(cid, initChannel(cid));
    const e = channelDataMap.get(cid)!;
    const cost = parseFloat(String(p.cost ?? 0));
    e.purchasesTotal += cost;
    e.purchasesCount += 1;
    if (p.paymentStatus !== "paid") e.unpaidPurchasesTotal += cost;
    if (p.subscribersGained) e.subscribersGained += p.subscribersGained;
    if (p.botStoriesCost) e.botStoriesPurchaseCost += parseFloat(String(p.botStoriesCost));
    if (p.direction) {
      const dir = p.direction.trim();
      if (dir && !e.topDirections.includes(dir)) e.topDirections.push(dir);
    }
    if (p.tariff) {
      const t = p.tariff.trim();
      if (t && !e.topTariffs.includes(t)) e.topTariffs.push(t);
    }
  }

  // Aggregate reach/spm/sourceSubscribers/buyerSubscribers per channel
  for (const cid of Array.from(channelDataMap.keys())) {
    const chPurchases = allPurchases.filter(p => p.channelId === cid);
    const reachVals = chPurchases.filter(p => p.reach != null).map(p => p.reach as number);
    const spmVals = chPurchases.filter(p => p.spm && /^\d+/.test(p.spm)).map(p => parseFloat(p.spm!));
    const srcSubVals = chPurchases.filter(p => p.sourceSubscribers != null).map(p => p.sourceSubscribers as number);
    const e = channelDataMap.get(cid)!;
    if (reachVals.length > 0) e.avgPurchaseReach = Math.round(reachVals.reduce((a, b) => a + b, 0) / reachVals.length);
    if (spmVals.length > 0) e.avgSpm = Math.round(spmVals.reduce((a, b) => a + b, 0) / spmVals.length);
    if (srcSubVals.length > 0) e.avgSourceSubscribers = Math.round(srcSubVals.reduce((a, b) => a + b, 0) / srcSubVals.length);

    const chSales = allSales.filter(s => s.channelId === cid);
    const saleReachVals = chSales.filter(s => s.reach != null).map(s => s.reach as number);
    const buyerSubVals = chSales.filter(s => s.buyerSubscribers != null).map(s => s.buyerSubscribers as number);
    if (saleReachVals.length > 0) e.avgSaleReach = Math.round(saleReachVals.reduce((a, b) => a + b, 0) / saleReachVals.length);
    if (buyerSubVals.length > 0) e.avgBuyerSubscribers = Math.round(buyerSubVals.reduce((a, b) => a + b, 0) / buyerSubVals.length);
  }

  // Attach snapshot data
  for (const [cid, snap] of Array.from(latestSnap.entries())) {
    if (!channelDataMap.has(cid)) channelDataMap.set(cid, initChannel(cid));
    const e = channelDataMap.get(cid)!;
    e.currentSubscribers = snap.subscriberCount;
    e.er24 = snap.er24 ? parseFloat(String(snap.er24)) : null;
    e.views24h = snap.views24h ?? null;
    e.views48h = snap.views48h ?? null;
    e.views72h = snap.views72h ?? null;
    e.weeklyGrowth = snap.weeklyGrowth ?? null;
  }

  // Attach CPF data
  for (const [cid, cpf] of Array.from(cpfByChannel.entries())) {
    if (!channelDataMap.has(cid)) channelDataMap.set(cid, initChannel(cid));
    const e = channelDataMap.get(cid)!;
    if (cpf.cpfs.length > 0) {
      e.avgCpf = Math.round((cpf.cpfs.reduce((a, b) => a + b, 0) / cpf.cpfs.length) * 100) / 100;
    }
    if (e.subscribersGained === 0) e.subscribersGained = cpf.totalGrowth;
  }

  // Finalize profit/ROI
  const channelsList: AiChannelData[] = [];
  for (const e of Array.from(channelDataMap.values())) {
    e.profit = e.salesTotal - e.purchasesTotal;
    e.roi = e.purchasesTotal > 0
      ? ((e.salesTotal - e.purchasesTotal) / e.purchasesTotal) * 100
      : (e.salesTotal > 0 ? Infinity : 0);
    channelsList.push(e);
  }
  channelsList.sort((a, b) => b.profit - a.profit);

  // Totals
  const totalSales = channelsList.reduce((s, c) => s + c.salesTotal, 0);
  const totalPurchases = channelsList.reduce((s, c) => s + c.purchasesTotal, 0);
  const totalProfit = totalSales - totalPurchases;
  const overallROI = totalPurchases > 0 ? ((totalSales - totalPurchases) / totalPurchases) * 100 : 0;
  const totalSubscribersGained = channelsList.reduce((s, c) => s + c.subscribersGained, 0);
  const totalCurrentSubscribers = channelsList.reduce((s, c) => s + (c.currentSubscribers ?? 0), 0);
  const allCpfs = channelsList.filter(c => c.avgCpf !== null).map(c => c.avgCpf as number);
  const overallAvgCpf = allCpfs.length > 0
    ? Math.round((allCpfs.reduce((a, b) => a + b, 0) / allCpfs.length) * 100) / 100
    : null;

  return {
    month: month ?? null,
    channels: channelsList,
    mutual: mutualSummary,
    totalSales, totalPurchases, totalProfit, overallROI,
    totalSubscribersGained, totalCurrentSubscribers, overallAvgCpf,
  };
}
