import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Channel,
  InsertChannel,
  InsertPurchaseRecord,
  InsertSaleRecord,
  InsertUser,
  PurchaseRecord,
  SaleRecord,
  channels,
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
