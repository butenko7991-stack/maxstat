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
  expenses,
  Expense,
  InsertExpense,
  postAnalytics,
  PostAnalytics,
  InsertPostAnalytics,
  clients,
  Client,
  InsertClient,
  clientChannels,
  ClientChannel,
  InsertClientChannel,
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

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLocalUser(data: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin" | "buyer" | "manager";
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(users).values({
    openId: data.openId,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "local",
    role: data.role ?? "user",
    lastSignedIn: new Date(),
  });
}

export async function updateUserPasswordHash(openId: string, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.openId, openId));
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

export async function getVisibleChannelsByUser(userId: number): Promise<Channel[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.isVisible, true)))
    .orderBy(channels.createdAt);
}
export async function updateChannel(
  id: number,
  userId: number,
  data: Partial<Pick<InsertChannel, "name" | "description" | "isVisible">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(channels)
    .set(data)
    .where(and(eq(channels.id, id), eq(channels.userId, userId)));
}

export async function countChannelRecords(channelId: number, userId: number): Promise<{ purchases: number; sales: number }> {
  const db = await getDb();
  if (!db) return { purchases: 0, sales: 0 };
  const [pAgg, sAgg] = await Promise.all([
    db.select({ count: sql<string>`COUNT(*)` }).from(purchaseRecords)
      .where(and(eq(purchaseRecords.channelId, channelId), eq(purchaseRecords.userId, userId))),
    db.select({ count: sql<string>`COUNT(*)` }).from(saleRecords)
      .where(and(eq(saleRecords.channelId, channelId), eq(saleRecords.userId, userId))),
  ]);
  return {
    purchases: parseInt(pAgg[0]?.count ?? '0'),
    sales: parseInt(sAgg[0]?.count ?? '0'),
  };
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

  const userChannels = await getVisibleChannelsByUser(userId);
  if (userChannels.length === 0) return [];
  const summaries: ChannelSummary[] = [];;

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
  expenses: number;
  netProfit: number;
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

  // Fetch expenses per month (not filtered by channel — expenses are global)
  const expenseRows = await db
    .select({
      month: expenses.month,
      total: sql<string>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL(12,2))), 0)`,
    })
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .groupBy(expenses.month);
  const expenseByMonth = new Map<string, number>();
  for (const row of expenseRows) {
    expenseByMonth.set(row.month, parseFloat(row.total));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { purchases, sales }]) => {
      const grossProfit = sales - purchases;
      const monthExpenses = expenseByMonth.get(month) ?? 0;
      return {
        month,
        purchases,
        sales,
        profit: grossProfit,
        expenses: monthExpenses,
        netProfit: grossProfit - monthExpenses,
      };
    });
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
  purchases: Array<Pick<PurchaseRecord, "id" | "channelId" | "date" | "admin" | "cost" | "paymentStatus" | "bookingSlot" | "timeSlot" | "isMutual">>;
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
        isMutual: purchaseRecords.isMutual,
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
  bookingSlot: "утро" | "обед" | "вечер" | "ночной топ",
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

  // Get user channels (only visible ones for analytics)
  const userChannels = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.isVisible, true)));
  const channelMap = new Map(userChannels.map((c) => [c.id, c.name]));
  const visibleChannelIds = new Set(userChannels.map((c) => c.id));
  // Sales aggregation per channell
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

  // Calculate profit and ROI (only for visible channels)
  const channelsData: ChannelProfitData[] = [];
  for (const entry of Array.from(channelDataMap.values())) {
    if (!visibleChannelIds.has(entry.channelId)) continue;
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

// ─── Mutual Deal "Umbrella" helpers ───────────────────────────────────────────
/**
 * Input for creating a ВП deal with auto-linked sale/purchase records.
 * - "Our post" = we place partner's ad in our channel → sale_record (revenue = doplate if they_pay, else 0)
 * - "Partner post" = partner places our ad in their channel → purchase_record (cost = doplate if we_pay, else 0)
 */
export interface CreateMutualDealInput {
  userId: number;
  ourChannelId: number;
  /** Additional channel IDs for multi-channel ВП (creates separate sale+purchase per channel) */
  ourChannelIds?: number[] | null;
  partnerChannelName: string;
  partnerContact?: string | null;
  month: string;
  notes?: string | null;
  ourPostDate?: Date | null;
  ourBookingSlot?: "утро" | "обед" | "вечер" | "ночной топ" | null;
  ourReach?: number | null;
  ourPostLink?: string | null;
  partnerPostDate?: Date | null;
  partnerBookingSlot?: "утро" | "обед" | "вечер" | "ночной топ" | null;
  partnerReach?: number | null;
  partnerPostLink?: string | null;
  dealType: "без доплаты" | "с доплатой";
  dopDirection?: "мы платим" | "нам платят" | null;
  dopAmount?: string | null;
  dopPaymentStatus: "paid" | "unpaid" | "not_applicable";
  status: "предложение" | "согласовано" | "размещено" | "завершено" | "отменено";
}

export async function createMutualDealWithRecords(input: CreateMutualDealInput): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const dopAmountNum = input.dopAmount ? parseFloat(input.dopAmount) : 0;
  const saleRevenue = (input.dealType === "с доплатой" && input.dopDirection === "нам платят")
    ? String(dopAmountNum) : "0";
  const purchaseCost = (input.dealType === "с доплатой" && input.dopDirection === "мы платим")
    ? String(dopAmountNum) : "0";
  const salePaymentStatus: "paid" | "unpaid" =
    input.dealType === "с доплатой" && input.dopDirection === "нам платят"
      ? (input.dopPaymentStatus as "paid" | "unpaid") : "paid";
  const purchasePaymentStatus: "paid" | "unpaid" =
    input.dealType === "с доплатой" && input.dopDirection === "мы платим"
      ? (input.dopPaymentStatus as "paid" | "unpaid") : "paid";

  const saleId = await createSaleRecord({
    userId: input.userId,
    channelId: input.ourChannelId,
    date: input.ourPostDate ?? new Date(),
    admin: input.partnerChannelName,
    link: input.ourPostLink ?? null,
    month: input.month,
    reach: input.ourReach ?? null,
    cost: saleRevenue,
    paymentStatus: salePaymentStatus,
    isMutual: true,
    partnerChannel: input.partnerChannelName,
    ourReach: input.ourReach ?? null,
    partnerReach: input.partnerReach ?? null,
    notes: input.notes ?? null,
    // Slot for schedule grid
    bookingSlot: input.ourBookingSlot ?? undefined,
    timeSlot: input.ourBookingSlot ?? undefined,
  });

  const purchaseId = await createPurchaseRecord({
    userId: input.userId,
    channelId: input.ourChannelId,
    date: input.partnerPostDate ?? new Date(),
    admin: input.partnerChannelName,
    link: input.partnerPostLink ?? null,
    month: input.month,
    reach: input.partnerReach ?? null,
    cost: purchaseCost,
    paymentStatus: purchasePaymentStatus,
    isMutual: true,
    partnerChannel: input.partnerChannelName,
    notes: input.notes ?? null,
    // Slot for schedule grid
    bookingSlot: input.partnerBookingSlot ?? undefined,
    timeSlot: input.partnerBookingSlot ?? undefined,
  });

  // For multi-channel: create additional sale+purchase records for each extra channel
  const extraChannelIds = (input.ourChannelIds ?? []).filter(cid => cid !== input.ourChannelId);
  for (const extraChannelId of extraChannelIds) {
    await createSaleRecord({
      userId: input.userId,
      channelId: extraChannelId,
      date: input.ourPostDate ?? new Date(),
      admin: input.partnerChannelName,
      link: input.ourPostLink ?? null,
      month: input.month,
      reach: input.ourReach ?? null,
      cost: saleRevenue,
      paymentStatus: salePaymentStatus,
      isMutual: true,
      partnerChannel: input.partnerChannelName,
      ourReach: input.ourReach ?? null,
      partnerReach: input.partnerReach ?? null,
      notes: input.notes ?? null,
      bookingSlot: input.ourBookingSlot ?? undefined,
      timeSlot: input.ourBookingSlot ?? undefined,
    });
    await createPurchaseRecord({
      userId: input.userId,
      channelId: extraChannelId,
      date: input.partnerPostDate ?? new Date(),
      admin: input.partnerChannelName,
      link: input.partnerPostLink ?? null,
      month: input.month,
      reach: input.partnerReach ?? null,
      cost: purchaseCost,
      paymentStatus: purchasePaymentStatus,
      isMutual: true,
      partnerChannel: input.partnerChannelName,
      notes: input.notes ?? null,
      bookingSlot: input.partnerBookingSlot ?? undefined,
      timeSlot: input.partnerBookingSlot ?? undefined,
    });
  }
  // All selected channel IDs (primary + extras)
  const allChannelIds = [input.ourChannelId, ...extraChannelIds];
  const dealResult = await db.insert(mutualDeals).values({
    userId: input.userId,
    ourChannelId: input.ourChannelId,
    ourChannelIds: allChannelIds.length > 1 ? JSON.stringify(allChannelIds) : null,
    partnerChannelName: input.partnerChannelName,
    partnerContact: input.partnerContact ?? null,
    ourPostDate: input.ourPostDate ?? null,
    partnerPostDate: input.partnerPostDate ?? null,
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
    saleRecordId: saleId,
    purchaseRecordId: purchaseId,
  });
  return (dealResult[0] as any).insertId as number;
}

export async function updateMutualDealWithRecords(
  id: number,
  userId: number,
  input: Partial<CreateMutualDealInput>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getMutualDealById(id, userId);
  if (!existing) return;

  const dopAmountNum = input.dopAmount ? parseFloat(input.dopAmount) : 0;
  const dealType = input.dealType ?? existing.dealType;
  const dopDirection = input.dopDirection !== undefined ? input.dopDirection : existing.dopDirection;
  const dopPaymentStatus = input.dopPaymentStatus ?? existing.dopPaymentStatus;

  const saleRevenue = (dealType === "с доплатой" && dopDirection === "нам платят") ? String(dopAmountNum) : "0";
  const purchaseCost = (dealType === "с доплатой" && dopDirection === "мы платим") ? String(dopAmountNum) : "0";
  const salePaymentStatus: "paid" | "unpaid" =
    dealType === "с доплатой" && dopDirection === "нам платят" ? (dopPaymentStatus as "paid" | "unpaid") : "paid";
  const purchasePaymentStatus: "paid" | "unpaid" =
    dealType === "с доплатой" && dopDirection === "мы платим" ? (dopPaymentStatus as "paid" | "unpaid") : "paid";

  if (existing.saleRecordId) {
    const saleUpdate: Record<string, unknown> = { cost: saleRevenue, paymentStatus: salePaymentStatus };
    if (input.ourPostDate !== undefined) saleUpdate.date = input.ourPostDate;
    if (input.ourReach !== undefined) { saleUpdate.reach = input.ourReach; saleUpdate.ourReach = input.ourReach; }
    if (input.partnerReach !== undefined) saleUpdate.partnerReach = input.partnerReach;
    if (input.ourPostLink !== undefined) saleUpdate.link = input.ourPostLink;
    if (input.partnerChannelName !== undefined) saleUpdate.admin = input.partnerChannelName;
    if (input.notes !== undefined) saleUpdate.notes = input.notes;
    await updateSaleRecord(existing.saleRecordId, userId, saleUpdate as any);
  }

  if (existing.purchaseRecordId) {
    const purchaseUpdate: Record<string, unknown> = { cost: purchaseCost, paymentStatus: purchasePaymentStatus };
    if (input.partnerPostDate !== undefined) purchaseUpdate.date = input.partnerPostDate;
    if (input.partnerReach !== undefined) purchaseUpdate.reach = input.partnerReach;
    if (input.partnerPostLink !== undefined) purchaseUpdate.link = input.partnerPostLink;
    if (input.partnerChannelName !== undefined) purchaseUpdate.admin = input.partnerChannelName;
    if (input.notes !== undefined) purchaseUpdate.notes = input.notes;
    await updatePurchaseRecord(existing.purchaseRecordId, userId, purchaseUpdate as any);
  }

  const dealUpdate: Partial<InsertMutualDeal> = {};
  if (input.partnerChannelName !== undefined) dealUpdate.partnerChannelName = input.partnerChannelName;
  if (input.partnerContact !== undefined) dealUpdate.partnerContact = input.partnerContact ?? null;
  if (input.ourPostDate !== undefined) dealUpdate.ourPostDate = input.ourPostDate ?? null;
  if (input.partnerPostDate !== undefined) dealUpdate.partnerPostDate = input.partnerPostDate ?? null;
  if (input.ourReach !== undefined) dealUpdate.ourReach = input.ourReach ?? null;
  if (input.partnerReach !== undefined) dealUpdate.partnerReach = input.partnerReach ?? null;
  if (input.dealType !== undefined) dealUpdate.dealType = input.dealType;
  if (input.dopDirection !== undefined) dealUpdate.dopDirection = input.dopDirection ?? null;
  if (input.dopAmount !== undefined) dealUpdate.dopAmount = input.dopAmount ?? null;
  if (input.dopPaymentStatus !== undefined) dealUpdate.dopPaymentStatus = input.dopPaymentStatus;
  if (input.ourPostLink !== undefined) dealUpdate.ourPostLink = input.ourPostLink ?? null;
  if (input.partnerPostLink !== undefined) dealUpdate.partnerPostLink = input.partnerPostLink ?? null;
  if (input.status !== undefined) dealUpdate.status = input.status;
  if (input.notes !== undefined) dealUpdate.notes = input.notes ?? null;
  if (input.month !== undefined) dealUpdate.month = input.month;
  if (input.ourChannelId !== undefined) dealUpdate.ourChannelId = input.ourChannelId;
  await updateMutualDeal(id, userId, dealUpdate);
}

export async function deleteMutualDealWithRecords(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getMutualDealById(id, userId);
  if (!existing) return;
  if (existing.saleRecordId) await deleteSaleRecord(existing.saleRecordId, userId);
  if (existing.purchaseRecordId) await deletePurchaseRecord(existing.purchaseRecordId, userId);
  await deleteMutualDeal(id, userId);
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
  cpfDirect: number | null; // CPF from direct subscribersGained field (higher confidence)
  directSubscribersGained: number; // sum of subscribersGained from purchase records in this week
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
  channelIds: number[],
  month?: string
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

  // Get all PAID purchases for these channels (only paid ones count for CPF)
  const purchases = await db
    .select({
      channelId: purchaseRecords.channelId,
      date: purchaseRecords.date,
      cost: purchaseRecords.cost,
      subscribersGained: purchaseRecords.subscribersGained,
    })
    .from(purchaseRecords)
    .where(
      and(
        eq(purchaseRecords.userId, userId),
        eq(purchaseRecords.paymentStatus, "paid"),
        channelIds.length > 0
          ? sql`${purchaseRecords.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`
          : sql`1=1`,
        month ? sql`DATE_FORMAT(${purchaseRecords.date}, '%Y-%m') = ${month}` : sql`1=1`
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
      // Direct subscriber data from purchase records (higher confidence than snapshot diff)
      const directSubscribersGained = weekPurchases.reduce((sum, p) => sum + (p.subscribersGained ?? 0), 0);

      // CPF from snapshot growth (secondary source)
      const cpfFromSnapshot = growth > 0 ? Math.round((purchaseCost / growth) * 100) / 100 : null;
      // CPF from direct subscribersGained (primary source when available)
      const cpfDirect = directSubscribersGained > 0 ? Math.round((purchaseCost / directSubscribersGained) * 100) / 100 : null;

      result.push({
        weekLabel,
        weekStart: new Date(curr.snapshotDate).toISOString().slice(0, 10),
        channelId,
        channelName: channelNameMap.get(channelId) ?? `Канал ${channelId}`,
        subscribersBefore: prev.subscriberCount ?? 0,
        subscribersAfter: curr.subscriberCount ?? 0,
        growth,
        purchaseCost,
        cpf: cpfFromSnapshot,
        cpfDirect,
        directSubscribersGained,
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
export async function getSourceEfficiency(userId: number, month?: string): Promise<SourceEfficiencyData[]> {
  const db = await getDb();
  if (!db) return [];

  // Only count PAID purchases for CPF (unpaid skews the numbers)
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
        eq(purchaseRecords.paymentStatus, "paid"),
        sql`${purchaseRecords.sourceSubscribers} IS NOT NULL`,
        month ? sql`DATE_FORMAT(${purchaseRecords.date}, '%Y-%m') = ${month}` : sql`1=1`
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

  avgSourceSubscribers: number | null; // avg size of source channels
  // Sale breakdown
  platforms: string[]; // unique platforms
  avgSaleReach: number | null;
  mutualSalesCount: number; // isMutual=true sales
  mutualSalesRevenue: number;
  mutualPurchasesCount: number; // isMutual=true purchases
  mutualPurchasesTotal: number; // sum of VP purchase costs

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
  // Expenses
  totalExpenses: number;
  netProfit: number;
  expensesByCategory: Record<string, number>;
}

export async function getAiContext(userId: number, month?: string): Promise<AiContext> {
  const db = await getDb();
  const empty: AiContext = {
    month: month ?? null,
    channels: [],
    mutual: { total: 0, completed: 0, active: 0, totalDopPaid: 0, totalDopReceived: 0, avgOurReach: null, avgPartnerReach: null },
    totalSales: 0, totalPurchases: 0, totalProfit: 0, overallROI: 0,
    totalSubscribersGained: 0, totalCurrentSubscribers: 0, overallAvgCpf: null,
    totalExpenses: 0, netProfit: 0, expensesByCategory: {},
  };
  if (!db) return empty;

  // ── Channels (only visible ones for AI analytics) ────────────────────────
  const userChannels = await db.select({ id: channels.id, name: channels.name })
    .from(channels).where(and(eq(channels.userId, userId), eq(channels.isVisible, true)));
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
  const cpfByChannel = new Map<number, { cpfs: number[]; totalGrowth: number; firstCount: number | null; lastCount: number | null }>();
  for (const row of cpfRows) {
    if (!cpfByChannel.has(row.channelId)) cpfByChannel.set(row.channelId, { cpfs: [], totalGrowth: 0, firstCount: null, lastCount: null });
    const e = cpfByChannel.get(row.channelId)!;
    if (row.cpf !== null) e.cpfs.push(row.cpf);
    e.totalGrowth += row.growth;
    // Track first and last subscriber counts across all CPF rows (sorted by weekStart)
    if (e.firstCount === null) e.firstCount = row.subscribersBefore;
    e.lastCount = row.subscribersAfter;
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
    avgSourceSubscribers: null,
    platforms: [], avgSaleReach: null, mutualSalesCount: 0, mutualSalesRevenue: 0,
    mutualPurchasesCount: 0, mutualPurchasesTotal: 0,
    avgBuyerSubscribers: null,
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
    if (p.isMutual) { e.mutualPurchasesCount += 1; e.mutualPurchasesTotal += cost; }

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

  // Attach CPF data — use weighted CPF (total cost / total growth) per channel
  for (const [cid, cpf] of Array.from(cpfByChannel.entries())) {
    if (!channelDataMap.has(cid)) channelDataMap.set(cid, initChannel(cid));
    const e = channelDataMap.get(cid)!;

    // Weighted CPF: total spend / total subscriber growth (more accurate than avg-of-weeks)
    if (cpf.totalGrowth > 0) {
      // Sum total purchase cost for this channel from cpfRows
      const totalCostForChannel = cpfRows
        .filter(r => r.channelId === cid)
        .reduce((s, r) => s + r.purchaseCost, 0);
      e.avgCpf = totalCostForChannel > 0
        ? Math.round((totalCostForChannel / cpf.totalGrowth) * 100) / 100
        : null;
    } else if (cpf.cpfs.length > 0) {
      // Fallback: use average of weekly CPFs if no positive total growth
      e.avgCpf = Math.round((cpf.cpfs.reduce((a, b) => a + b, 0) / cpf.cpfs.length) * 100) / 100;
    }

    // subscribersGained: prefer direct purchase records data, then snapshot diff
    if (e.subscribersGained === 0 && cpf.firstCount !== null && cpf.lastCount !== null) {
      e.subscribersGained = Math.max(0, cpf.lastCount - cpf.firstCount);
    }
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
  // Overall weighted CPF: total purchases / total subscribers gained (across all channels)
  const totalSubsGainedForCpf = channelsList.reduce((s, c) => s + c.subscribersGained, 0);
  const totalPurchasesForCpf = channelsList.reduce((s, c) => s + c.purchasesTotal, 0);
  const overallAvgCpf = totalSubsGainedForCpf > 0
    ? Math.round((totalPurchasesForCpf / totalSubsGainedForCpf) * 100) / 100
    : null;

   // ── Expenses ─────────────────────────────────────────────────────────────
  const expenseSummary = await getExpenseSummary(userId, month);
  const totalExpenses = expenseSummary.total;
  const netProfit = totalProfit - totalExpenses;
  return {
    month: month ?? null,
    channels: channelsList,
    mutual: mutualSummary,
    totalSales, totalPurchases, totalProfit, overallROI,
    totalSubscribersGained, totalCurrentSubscribers, overallAvgCpf,
    totalExpenses, netProfit, expensesByCategory: expenseSummary.byCategory,
  };
}
// ─── Expenses ───────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  userId: number;
  month: string;
  category: string;
  description?: string;
  amount: number;
  paymentStatus?: "paid" | "unpaid";
}

export interface UpdateExpenseInput {
  month?: string;
  category?: string;
  description?: string;
  amount?: number;
  paymentStatus?: "paid" | "unpaid";
}

export async function getExpenses(
  userId: number,
  month?: string
): Promise<Expense[]> {
  const db = await getDb();
  if (!db) return [];
  const conds: any[] = [eq(expenses.userId, userId)];
  if (month) conds.push(eq(expenses.month, month));
  return db.select().from(expenses).where(and(...conds)).orderBy(desc(expenses.createdAt));
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(expenses).values({
    userId: input.userId,
    month: input.month,
    category: input.category,
    description: input.description ?? null,
    amount: String(input.amount),
    paymentStatus: input.paymentStatus ?? "unpaid",
  });
  const [row] = await db.select().from(expenses).where(eq(expenses.id, (result as any).insertId));
  return row;
}

export async function updateExpense(
  id: number,
  userId: number,
  input: UpdateExpenseInput
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const data: Record<string, unknown> = {};
  if (input.month !== undefined) data.month = input.month;
  if (input.category !== undefined) data.category = input.category;
  if (input.description !== undefined) data.description = input.description;
  if (input.amount !== undefined) data.amount = String(input.amount);
  if (input.paymentStatus !== undefined) data.paymentStatus = input.paymentStatus;
  if (Object.keys(data).length === 0) return;
  await db.update(expenses).set(data).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
}

export async function deleteExpense(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
}

export async function getExpenseSummary(
  userId: number,
  month?: string
): Promise<{ total: number; paid: number; unpaid: number; byCategory: Record<string, number> }> {
  const db = await getDb();
  if (!db) return { total: 0, paid: 0, unpaid: 0, byCategory: {} };
  const conds: any[] = [eq(expenses.userId, userId)];
  if (month) conds.push(eq(expenses.month, month));
  const rows = await db.select().from(expenses).where(and(...conds));
  let total = 0, paid = 0, unpaid = 0;
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    const amt = parseFloat(String(r.amount ?? 0));
    total += amt;
    if (r.paymentStatus === "paid") paid += amt; else unpaid += amt;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + amt;
  }
  return { total, paid, unpaid, byCategory };
}

// ─── Post Analytics ───────────────────────────────────────────────────────────

/**
 * Fetch and parse a Trustat (anypost.trustat.me) analytics page.
 * Returns structured data extracted from the embedded JSON.
 */
export async function fetchTrustatAnalytics(url: string): Promise<{
  postTitle: string | null;
  totalViews: number | null;
  views24h: number | null;
  views48h: number | null;
  views72h: number | null;
  err24h: number | null;
  totalSubscribers: number | null;
  channelCount: number;
  channels: Array<{
    channelTitle: string;
    channelSubs: number;
    currentViews: number;
    views24h: number | null;
    views48h: number | null;
    err24h: number | null;
    status: string;
    postUrl: string | null;
  }>;
  rawJson: string;
} | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AdsManager/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

     // Extract the embedded JSON payload from self.__next_f.push
    const scriptMatch = html.match(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/);
    
    let reportData: any = null;
    
    if (scriptMatch) {
      try {
        // Unescape the JSON string
        const unescaped = scriptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        const reportExtract = unescaped.match(/"report":\{([\s\S]*?),"increments"/);
        if (reportExtract) {
          reportData = JSON.parse('{"report":{' + reportExtract[1] + '}}').report;
        }
      } catch {}
    }

    // Alternative: find full JSON object
    if (!reportData) {
      const fullMatch = html.match(/"report":\{[\s\S]*?"total_views":\d+\}/);
      if (fullMatch) {
        try {
          reportData = JSON.parse('{' + fullMatch[0] + '}').report;
        } catch {}
      }
    }

    // Fallback: use LLM to extract from HTML text
    if (!reportData) {
      return null;
    }

    const summary = reportData.summary ?? {};
    const posts: any[] = reportData.posts ?? [];

    const channelList = posts.map((p: any) => ({
      channelTitle: p.channel_title ?? "",
      channelSubs: p.channel_subs ?? 0,
      currentViews: p.current_views ?? p.views ?? 0,
      views24h: p.views_24h ?? null,
      views48h: p.views_48h ?? null,
      err24h: p.err_24h ?? null,
      status: p.status ?? "unknown",
      postUrl: p.post_url ?? null,
    }));

    return {
      postTitle: reportData.draft_name ?? null,
      totalViews: summary.current_views ?? null,
      views24h: summary.views_24h ?? null,
      views48h: summary.views_48h ?? null,
      views72h: summary.views_72h ?? null,
      err24h: summary.err_24h ?? null,
      totalSubscribers: summary.subscribers_total_known ?? null,
      channelCount: posts.length,
      channels: channelList,
      rawJson: JSON.stringify(reportData),
    };
  } catch (err) {
    console.error("[fetchTrustatAnalytics] Error:", err);
    return null;
  }
}

export async function upsertPostAnalytics(
  userId: number,
  recordType: "sale" | "purchase",
  recordId: number,
  url: string
): Promise<PostAnalytics | null> {
  const db = await getDb();
  if (!db) return null;

  const data = await fetchTrustatAnalytics(url);
  if (!data) return null;

  // Check if record already exists
  const existing = await db
    .select()
    .from(postAnalytics)
    .where(and(eq(postAnalytics.recordType, recordType), eq(postAnalytics.recordId, recordId)))
    .limit(1);

  const payload: InsertPostAnalytics = {
    userId,
    recordType,
    recordId,
    url,
    postTitle: data.postTitle,
    totalViews: data.totalViews ?? undefined,
    views24h: data.views24h ?? undefined,
    views48h: data.views48h ?? undefined,
    views72h: data.views72h ?? undefined,
    err24h: data.err24h != null ? String(data.err24h) : undefined,
    totalSubscribers: data.totalSubscribers ?? undefined,
    channelCount: data.channelCount,
    channelsJson: JSON.stringify(data.channels),
    rawJson: data.rawJson,
  };

  if (existing.length > 0) {
    await db
      .update(postAnalytics)
      .set({ ...payload, fetchedAt: new Date() })
      .where(eq(postAnalytics.id, existing[0].id));
    const updated = await db.select().from(postAnalytics).where(eq(postAnalytics.id, existing[0].id)).limit(1);
    return updated[0] ?? null;
  } else {
    const result = await db.insert(postAnalytics).values(payload);
    const insertId = (result as any)[0]?.insertId;
    if (!insertId) return null;
    const inserted = await db.select().from(postAnalytics).where(eq(postAnalytics.id, insertId)).limit(1);
    return inserted[0] ?? null;
  }
}

export async function getPostAnalyticsByRecord(
  recordType: "sale" | "purchase",
  recordId: number
): Promise<PostAnalytics | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(postAnalytics)
    .where(and(eq(postAnalytics.recordType, recordType), eq(postAnalytics.recordId, recordId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPostAnalyticsByUser(userId: number): Promise<PostAnalytics[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(postAnalytics)
    .where(eq(postAnalytics.userId, userId))
    .orderBy(desc(postAnalytics.fetchedAt));
}

// ─── Clients (CRM) ──────────────────────────────────────────────────────────

export interface ClientWithChannels extends Client {
  channels: ClientChannel[];
  purchaseCount: number;
  saleCount: number;
  totalPurchaseAmount: number;
  totalSaleAmount: number;
  lastDealAt: number | null;
}

export interface ClientStats {
  clientId: number;
  clientName: string;
  maxNick: string | null;
  type: string;
  niche: string | null;
  notes: string | null;
  channels: ClientChannel[];
  purchaseCount: number;
  saleCount: number;
  totalPurchaseCost: number;
  totalSaleRevenue: number;
  totalTurnover: number;
  avgPurchaseReach: number | null;
  avgSaleReach: number | null;
  avgCpf: number | null;
  totalSubscribersGained: number;
  lastDealDate: Date | null;
  createdAt: Date;
}

export async function listClients(userId: number): Promise<ClientWithChannels[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.userId, userId))
    .orderBy(desc(clients.createdAt));
  if (!rows.length) return [];
  const channelRows = await db
    .select()
    .from(clientChannels)
    .where(sql`${clientChannels.clientId} IN (${sql.join(rows.map(r => sql`${r.id}`), sql`, `)})`);
  const channelMap: Record<number, ClientChannel[]> = {};
  for (const ch of channelRows) {
    if (!channelMap[ch.clientId]) channelMap[ch.clientId] = [];
    channelMap[ch.clientId].push(ch);
  }
  // Aggregate purchase/sale stats per client name
  const allPurchases = await db
    .select({ admin: purchaseRecords.admin, cost: purchaseRecords.cost, date: purchaseRecords.date })
    .from(purchaseRecords)
    .where(eq(purchaseRecords.userId, userId));
  const allSales = await db
    .select({ admin: saleRecords.admin, cost: saleRecords.cost, date: saleRecords.date })
    .from(saleRecords)
    .where(eq(saleRecords.userId, userId));
  // Build name-keyed maps
  const purchaseMap: Record<string, { count: number; total: number; lastDate: number | null }> = {};
  for (const p of allPurchases) {
    const key = (p.admin ?? "").toLowerCase();
    if (!purchaseMap[key]) purchaseMap[key] = { count: 0, total: 0, lastDate: null };
    purchaseMap[key].count++;
    purchaseMap[key].total += parseFloat(String(p.cost ?? "0")) || 0;
    const ts = p.date ? new Date(p.date).getTime() : null;
    if (ts && (!purchaseMap[key].lastDate || ts > purchaseMap[key].lastDate!)) purchaseMap[key].lastDate = ts;
  }
  const saleMap: Record<string, { count: number; total: number; lastDate: number | null }> = {};
  for (const s of allSales) {
    const key = (s.admin ?? "").toLowerCase();
    if (!saleMap[key]) saleMap[key] = { count: 0, total: 0, lastDate: null };
    saleMap[key].count++;
    saleMap[key].total += parseFloat(String(s.cost ?? "0")) || 0;
    const ts = s.date ? new Date(s.date).getTime() : null;
    if (ts && (!saleMap[key].lastDate || ts > saleMap[key].lastDate!)) saleMap[key].lastDate = ts;
  }
  return rows.map(r => {
    const key = r.name.toLowerCase();
    const ps = purchaseMap[key] ?? { count: 0, total: 0, lastDate: null };
    const ss = saleMap[key] ?? { count: 0, total: 0, lastDate: null };
    const lastDealAt = ps.lastDate && ss.lastDate
      ? Math.max(ps.lastDate, ss.lastDate)
      : ps.lastDate ?? ss.lastDate ?? null;
    return {
      ...r,
      channels: channelMap[r.id] ?? [],
      purchaseCount: ps.count,
      saleCount: ss.count,
      totalPurchaseAmount: ps.total,
      totalSaleAmount: ss.total,
      lastDealAt,
    };
  });
}

export async function getClientById(id: number, userId: number): Promise<ClientWithChannels | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.userId, userId))).limit(1);
  if (!rows[0]) return null;
  const chRows = await db.select().from(clientChannels).where(eq(clientChannels.clientId, id));
  return {
    ...rows[0],
    channels: chRows,
    purchaseCount: 0,
    saleCount: 0,
    totalPurchaseAmount: 0,
    totalSaleAmount: 0,
    lastDealAt: null,
  };
}

export async function createClient(data: Omit<InsertClient, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(clients).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateClient(id: number, userId: number, data: Partial<Omit<InsertClient, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(clients).set(data).where(and(eq(clients.id, id), eq(clients.userId, userId)));
}

export async function deleteClient(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(clientChannels).where(eq(clientChannels.clientId, id));
  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.userId, userId)));
}

export async function setClientChannels(clientId: number, channels: Omit<InsertClientChannel, "id" | "clientId" | "createdAt">[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(clientChannels).where(eq(clientChannels.clientId, clientId));
  if (channels.length > 0) {
    await db.insert(clientChannels).values(channels.map(c => ({ ...c, clientId })));
  }
}

/** Extract channel name from iimax.ru or t.me URL */
function extractChannelFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // t.me/channelname/123 or t.me/channelname
    if (u.hostname === "t.me" || u.hostname === "telegram.me") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0]) return "@" + parts[0];
    }
    // iimax.ru/post/channelname/123 or similar
    if (u.hostname === "iimax.ru" || u.hostname === "www.iimax.ru") {
      const parts = u.pathname.split("/").filter(Boolean);
      // Try to find a channel-like segment (starts with @ or is a word after /post/ or /channel/)
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === "post" || parts[i] === "channel" || parts[i] === "p") {
          if (parts[i + 1]) return "@" + parts[i + 1];
        }
      }
      // Fallback: second segment
      if (parts[1]) return "@" + parts[1];
    }
  } catch {
    // ignore
  }
  return null;
}

export interface AutoImportResult {
  created: number;
  skipped: number;
  channelsExtracted: number;
}

/** Auto-import clients from existing purchase_records and sale_records.
 *  Groups by admin name, extracts channel names from links. */
export async function autoImportClients(userId: number): Promise<AutoImportResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Fetch all existing clients to avoid duplicates
  const existingClients = await db.select({ name: clients.name }).from(clients).where(eq(clients.userId, userId));
  const existingNames = new Set(existingClients.map(c => c.name.trim().toLowerCase()));

  // Aggregate admins + links from purchase_records
  const purchases = await db
    .select({ admin: purchaseRecords.admin, link: purchaseRecords.link })
    .from(purchaseRecords)
    .where(and(eq(purchaseRecords.userId, userId), sql`${purchaseRecords.admin} IS NOT NULL AND ${purchaseRecords.admin} != ''`));

  // Aggregate admins + links from sale_records
  const sales = await db
    .select({ admin: saleRecords.admin, link: saleRecords.link })
    .from(saleRecords)
    .where(and(eq(saleRecords.userId, userId), sql`${saleRecords.admin} IS NOT NULL AND ${saleRecords.admin} != ''`));

  // Build map: adminName -> Set of channel URLs
  const adminMap = new Map<string, Set<string>>();
  for (const row of [...purchases, ...sales]) {
    if (!row.admin) continue;
    const key = row.admin.trim();
    if (!adminMap.has(key)) adminMap.set(key, new Set());
    if (row.link) adminMap.get(key)!.add(row.link);
  }

  let created = 0;
  let skipped = 0;
  let channelsExtracted = 0;

  for (const [adminName, linkSet] of Array.from(adminMap.entries())) {
    if (existingNames.has(adminName.toLowerCase())) {
      skipped++;
      continue;
    }

    // Create client
    const clientId = await createClient({
      userId,
      name: adminName,
      maxNick: null,
      type: "оба",
      niche: null,
      notes: null,
    });
    created++;

    // Extract channels from links
    const channelNames = new Set<string>();
    for (const url of Array.from(linkSet)) {
      const ch = extractChannelFromUrl(url);
      if (ch) channelNames.add(ch);
    }

    if (channelNames.size > 0) {
      await setClientChannels(
        clientId,
        Array.from(channelNames).map(name => ({ channelName: name, channelUrl: null, subscribers: null }))
      );
      channelsExtracted += channelNames.size;
    }
  }

  return { created, skipped, channelsExtracted };
}

export async function getClientStats(clientId: number, userId: number): Promise<ClientStats | null> {
  const db = await getDb();
  if (!db) return null;

  const clientRow = await getClientById(clientId, userId);
  if (!clientRow) return null;

  // Get all purchases where admin matches client name
  const purchases = await db
    .select()
    .from(purchaseRecords)
    .where(and(
      eq(purchaseRecords.userId, userId),
      sql`LOWER(${purchaseRecords.admin}) = LOWER(${clientRow.name})`
    ));

  // Get all sales where admin matches client name
  const sales = await db
    .select()
    .from(saleRecords)
    .where(and(
      eq(saleRecords.userId, userId),
      sql`LOWER(${saleRecords.admin}) = LOWER(${clientRow.name})`
    ));

  const totalPurchaseCost = purchases.reduce((s, r) => s + (parseFloat(String(r.cost ?? "0")) || 0), 0);
  const totalSaleRevenue = sales.reduce((s, r) => s + (parseFloat(String(r.cost ?? "0")) || 0), 0);

  const purchasesWithReach = purchases.filter(r => r.reach != null && r.reach > 0);
  const salesWithReach = sales.filter(r => r.reach != null && r.reach > 0);
  const avgPurchaseReach = purchasesWithReach.length
    ? purchasesWithReach.reduce((s, r) => s + (r.reach ?? 0), 0) / purchasesWithReach.length
    : null;
  const avgSaleReach = salesWithReach.length
    ? salesWithReach.reduce((s, r) => s + (r.reach ?? 0), 0) / salesWithReach.length
    : null;

  const totalSubscribersGained = purchases.reduce((s, r) => s + (r.subscribersGained ?? 0), 0);
  const purchasesWithSubs = purchases.filter(r => (r.subscribersGained ?? 0) > 0);
  const avgCpf = purchasesWithSubs.length
    ? purchasesWithSubs.reduce((s, r) => {
        const cost = parseFloat(String(r.cost ?? "0")) || 0;
        const subs = r.subscribersGained ?? 0;
        return s + (subs > 0 ? cost / subs : 0);
      }, 0) / purchasesWithSubs.length
    : null;

  const allDates = [
    ...purchases.map(r => r.date),
    ...sales.map(r => r.date),
  ].filter(Boolean) as Date[];
  const lastDealDate = allDates.length
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : null;

  return {
    clientId,
    clientName: clientRow.name,
    maxNick: clientRow.maxNick,
    type: clientRow.type,
    niche: clientRow.niche,
    notes: clientRow.notes,
    channels: clientRow.channels,
    purchaseCount: purchases.length,
    saleCount: sales.length,
    totalPurchaseCost,
    totalSaleRevenue,
    totalTurnover: totalPurchaseCost + totalSaleRevenue,
    avgPurchaseReach: avgPurchaseReach ? Math.round(avgPurchaseReach) : null,
    avgSaleReach: avgSaleReach ? Math.round(avgSaleReach) : null,
    avgCpf: avgCpf ? Math.round(avgCpf * 100) / 100 : null,
    totalSubscribersGained,
    lastDealDate,
    createdAt: clientRow.createdAt,
  };
}

export async function getClientPurchases(clientId: number, userId: number): Promise<PurchaseRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const clientRow = await getClientById(clientId, userId);
  if (!clientRow) return [];
  return db
    .select()
    .from(purchaseRecords)
    .where(and(
      eq(purchaseRecords.userId, userId),
      sql`LOWER(${purchaseRecords.admin}) = LOWER(${clientRow.name})`
    ))
    .orderBy(desc(purchaseRecords.date));
}

export async function getClientSales(clientId: number, userId: number): Promise<SaleRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const clientRow = await getClientById(clientId, userId);
  if (!clientRow) return [];
  return db
    .select()
    .from(saleRecords)
    .where(and(
      eq(saleRecords.userId, userId),
      sql`LOWER(${saleRecords.admin}) = LOWER(${clientRow.name})`
    ))
    .orderBy(desc(saleRecords.date));
}

// ─── Client attributed CPF (combined algorithm C) ─────────────────────────────
/**
 * Per-purchase attributed CPF result.
 * growthAttributed: subscriber growth attributed to this purchase
 * cpf: cost per attributed follower (null if no growth or no snapshots)
 * method: "reach" | "cost" | "none"
 */
export type AttributedPurchase = {
  purchaseId: number;
  channelId: number;
  channelName: string;
  date: Date;
  cost: number;
  reach: number | null;
  growthAttributed: number | null;
  cpf: number | null;
  method: "reach" | "cost" | "none";
};

/**
 * Calculate attributed CPF for all purchases of a given client.
 *
 * Algorithm C (combined):
 *  1. For each purchase, find the snapshot week it falls into
 *     (between prev snapshot date inclusive and curr snapshot date exclusive).
 *  2. Collect all purchases for the same channel in that week.
 *  3. If any purchase in the week has reach > 0 → distribute growth proportionally by reach.
 *     Otherwise → distribute growth proportionally by cost.
 *  4. If no snapshots cover the purchase date → fall back to subscribersGained field if set.
 */
export async function getClientAttributedCpf(
  clientId: number,
  userId: number
): Promise<AttributedPurchase[]> {
  const db = await getDb();
  if (!db) return [];

  const clientRow = await getClientById(clientId, userId);
  if (!clientRow) return [];

  // All purchases for this client (matched by admin name)
  const clientPurchases = await db
    .select()
    .from(purchaseRecords)
    .where(and(
      eq(purchaseRecords.userId, userId),
      sql`LOWER(${purchaseRecords.admin}) = LOWER(${clientRow.name})`
    ))
    .orderBy(desc(purchaseRecords.date));

  if (clientPurchases.length === 0) return [];

  // Unique channel IDs involved
  const channelIds = Array.from(new Set(clientPurchases.map(p => p.channelId)));

  // All snapshots for these channels (ordered by channel + date)
  const snapshots = await db
    .select()
    .from(channelSubscriberSnapshots)
    .where(and(
      eq(channelSubscriberSnapshots.userId, userId),
      sql`${channelSubscriberSnapshots.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`
    ))
    .orderBy(channelSubscriberSnapshots.channelId, channelSubscriberSnapshots.snapshotDate);

  // All purchases for these channels (to compute week totals)
  const allChannelPurchases = await db
    .select()
    .from(purchaseRecords)
    .where(and(
      eq(purchaseRecords.userId, userId),
      sql`${purchaseRecords.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`
    ));

  // Channel name map
  const channelList = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.userId, userId));
  const channelNameMap = new Map(channelList.map(c => [c.id, c.name]));

  // Group snapshots by channelId
  const snapsByChannel = new Map<number, typeof snapshots>();
  for (const s of snapshots) {
    if (!snapsByChannel.has(s.channelId)) snapsByChannel.set(s.channelId, []);
    snapsByChannel.get(s.channelId)!.push(s);
  }

  // Build week intervals per channel: { channelId, prevDate, currDate, growth }
  type WeekInterval = {
    channelId: number;
    prevDate: Date;
    currDate: Date;
    growth: number;
  };
  const weekIntervals: WeekInterval[] = [];
  for (const [channelId, snaps] of Array.from(snapsByChannel)) {
    for (let i = 1; i < snaps.length; i++) {
      const prev = snaps[i - 1];
      const curr = snaps[i];
      const growth = (curr.subscriberCount ?? 0) - (prev.subscriberCount ?? 0);
      weekIntervals.push({
        channelId,
        prevDate: new Date(prev.snapshotDate),
        currDate: new Date(curr.snapshotDate),
        growth,
      });
    }
  }

  // For each client purchase, find its week interval and compute attributed CPF
  const result: AttributedPurchase[] = [];

  for (const p of clientPurchases) {
    const pDate = new Date(p.date);
    const pCost = parseFloat(String(p.cost ?? "0")) || 0;
    const pReach = p.reach ?? null;
    const chName = channelNameMap.get(p.channelId) ?? `Канал ${p.channelId}`;

    // Find matching week interval for this purchase
    const interval = weekIntervals.find(
      w => w.channelId === p.channelId && pDate >= w.prevDate && pDate < w.currDate
    );

    if (!interval) {
      // No snapshot coverage — fall back to subscribersGained if available
      const subs = p.subscribersGained ?? null;
      result.push({
        purchaseId: p.id,
        channelId: p.channelId,
        channelName: chName,
        date: pDate,
        cost: pCost,
        reach: pReach,
        growthAttributed: subs,
        cpf: subs && subs > 0 ? Math.round((pCost / subs) * 100) / 100 : null,
        method: "none",
      });
      continue;
    }

    if (interval.growth <= 0) {
      // Negative or zero growth week — CPF undefined
      result.push({
        purchaseId: p.id,
        channelId: p.channelId,
        channelName: chName,
        date: pDate,
        cost: pCost,
        reach: pReach,
        growthAttributed: 0,
        cpf: null,
        method: interval.growth < 0 ? "none" : "none",
      });
      continue;
    }

    // All purchases for the same channel in this week
    const weekPurchases = allChannelPurchases.filter(wp => {
      const wpDate = new Date(wp.date);
      return wp.channelId === p.channelId && wpDate >= interval.prevDate && wpDate < interval.currDate;
    });

    // Decide method: use reach if ANY purchase in the week has reach > 0
    const anyHasReach = weekPurchases.some(wp => (wp.reach ?? 0) > 0);
    const method: "reach" | "cost" = anyHasReach ? "reach" : "cost";

    let share = 0;
    if (method === "reach") {
      const totalReach = weekPurchases.reduce((s, wp) => s + (wp.reach ?? 0), 0);
      share = totalReach > 0 ? (pReach ?? 0) / totalReach : 0;
    } else {
      const totalCost = weekPurchases.reduce((s, wp) => s + (parseFloat(String(wp.cost ?? "0")) || 0), 0);
      share = totalCost > 0 ? pCost / totalCost : 0;
    }

    const growthAttributed = Math.round(interval.growth * share);
    const cpf = growthAttributed > 0 ? Math.round((pCost / growthAttributed) * 100) / 100 : null;

    result.push({
      purchaseId: p.id,
      channelId: p.channelId,
      channelName: chName,
      date: pDate,
      cost: pCost,
      reach: pReach,
      growthAttributed,
      cpf,
      method,
    });
  }

  return result;
}

// ─── External Sales Analytics ──────────────────────────────────────────────────
export async function getExternalSalesAnalytics(userId: number, months?: number) {
  const db = await getDb();
  if (!db) return { summary: [], totalRevenue: 0, totalCount: 0, byChannel: [], byMonth: [] };

  // Get all external sales
  const allSales = await db
    .select()
    .from(saleRecords)
    .where(and(eq(saleRecords.userId, userId), eq(saleRecords.isExternal, true)))
    .orderBy(desc(saleRecords.date));

  // Filter by months if specified
  const cutoff = months
    ? new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000)
    : null;
  const filtered = cutoff
    ? allSales.filter((r) => r.date && new Date(r.date) >= cutoff)
    : allSales;

  // Get all sales (including internal) for comparison
  const allUserSales = await db
    .select()
    .from(saleRecords)
    .where(eq(saleRecords.userId, userId));

  const channels = await getChannelsByUser(userId);
  const channelMap = Object.fromEntries(channels.map((c) => [c.id, c.name]));

  // Total revenue from external sales
  const totalRevenue = filtered.reduce((s, r) => s + (parseFloat(r.cost ?? "0") || 0), 0);
  const totalCount = filtered.length;

  // All sales revenue for comparison
  const allRevenue = allUserSales.reduce((s, r) => s + (parseFloat(r.cost ?? "0") || 0), 0);
  const externalShare = allRevenue > 0 ? Math.round((totalRevenue / allRevenue) * 100) : 0;

  // By channel breakdown
  const channelMap2: Record<number, { channelId: number; channelName: string; revenue: number; count: number; avgCost: number }> = {};
  for (const r of filtered) {
    if (!channelMap2[r.channelId]) {
      channelMap2[r.channelId] = {
        channelId: r.channelId,
        channelName: channelMap[r.channelId] ?? `Канал ${r.channelId}`,
        revenue: 0,
        count: 0,
        avgCost: 0,
      };
    }
    channelMap2[r.channelId].revenue += parseFloat(r.cost ?? "0") || 0;
    channelMap2[r.channelId].count += 1;
  }
  const byChannel = Object.values(channelMap2)
    .map((c) => ({ ...c, avgCost: c.count > 0 ? Math.round(c.revenue / c.count) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // By month breakdown
  const monthMap: Record<string, { month: string; revenue: number; count: number }> = {};
  for (const r of filtered) {
    const m = r.month ?? (r.date ? new Date(r.date).toISOString().slice(0, 7) : "unknown");
    if (!monthMap[m]) monthMap[m] = { month: m, revenue: 0, count: 0 };
    monthMap[m].revenue += parseFloat(r.cost ?? "0") || 0;
    monthMap[m].count += 1;
  }
  const byMonth = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

  // Last purchase date
  const lastPurchaseDate = filtered.length > 0 ? filtered[0].date : null;

  // Avg cost per external sale vs internal
  const internalSales = allUserSales.filter((r) => !r.isExternal);
  const avgExternalCost = totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0;
  const avgInternalCost = internalSales.length > 0
    ? Math.round(internalSales.reduce((s, r) => s + (parseFloat(r.cost ?? "0") || 0), 0) / internalSales.length)
    : 0;
  const costPremium = avgInternalCost > 0
    ? Math.round(((avgExternalCost - avgInternalCost) / avgInternalCost) * 100)
    : null;

  return {
    totalRevenue: Math.round(totalRevenue),
    totalCount,
    externalShare,
    avgExternalCost,
    avgInternalCost,
    costPremium,
    lastPurchaseDate,
    byChannel,
    byMonth,
  };
}
