import {
  bigint,
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "buyer", "manager"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Advertising channels (projects) — e.g. "Твоя Алиса", "Жабетта", etc.
 * Managed entirely by the owner; no hardcoded names.
 */
export const channels = mysqlTable("channels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = typeof channels.$inferInsert;

/**
 * Ad purchase records (Закуп).
 * Tracks money spent buying advertising placements from external channels.
 */
export const purchaseRecords = mysqlTable("purchase_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  channelId: int("channelId").notNull(), // which of the user's channels this purchase is for
  /** Date of the placement */
  date: timestamp("date").notNull(),
  /** Admin / channel owner name */
  admin: varchar("admin", { length: 255 }),
  /** Link to the external channel */
  link: varchar("link", { length: 1024 }),
  /** Target channels (comma-separated or free text) */
  targetChannels: text("targetChannels"),
  /** Niche / direction (e.g. психология, мода) */
  direction: varchar("direction", { length: 255 }),
  /** Tariff type (e.g. 1/48, фикс) */
  tariff: varchar("tariff", { length: 100 }),
  /** Buyer name */
  buyer: varchar("buyer", { length: 255 }),
  /** SPM value (e.g. "1000СПМ", "фикс", or numeric) */
  spm: varchar("spm", { length: 100 }),
  /** Reach / audience size (e.g. 500, 1000) — used for SPM cost calculation */
  reach: bigint("reach", { mode: "number" }),
  /** Cost in rubles */
  cost: decimal("cost", { precision: 12, scale: 2 }),
  /** Payment status */
  paymentStatus: mysqlEnum("paymentStatus", ["paid", "unpaid", "partial"]).default("unpaid").notNull(),
  /** Actual subscribers gained from this placement */
  subscribersGained: int("subscribersGained"),
  /** Approximate subscriber count of the source channel (for efficiency analysis) */
  sourceSubscribers: bigint("sourceSubscribers", { mode: "number" }),
  /** Mutual subscription deal (ВП) flag */
  isMutual: boolean("isMutual").default(false).notNull(),
  /** Partner channel name for ВП */
  partnerChannel: varchar("partnerChannel", { length: 255 }),
  /** Month label for grouping (e.g. "2026-04") */
  month: varchar("month", { length: 7 }).notNull(),
  /** Time slot — free text (e.g. утро, 10:00, вечер) */
  timeSlot: varchar("timeSlot", { length: 100 }),
  /** Booking slot for schedule grid — normalized enum */
  bookingSlot: mysqlEnum("bookingSlot", ["утро", "обед", "вечер"]),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PurchaseRecord = typeof purchaseRecords.$inferSelect;
export type InsertPurchaseRecord = typeof purchaseRecords.$inferInsert;

/**
 * Ad sale records (Продажа).
 * Tracks money earned by selling advertising placements in the user's own channels.
 */
export const saleRecords = mysqlTable("sale_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  channelId: int("channelId").notNull(),
  /** Date of the placement */
  date: timestamp("date").notNull(),
  /** Admin / advertiser name */
  admin: varchar("admin", { length: 255 }),
  /** Link in MAX or TG */
  link: varchar("link", { length: 1024 }),
  /** Time slot — free text (e.g. утро, 10:00, вечер) */
  timeSlot: varchar("timeSlot", { length: 100 }),
  /** Booking slot for schedule grid — normalized enum */
  bookingSlot: mysqlEnum("bookingSlot", ["утро", "обед", "вечер"]),
  /** Tariff type */
  tariff: varchar("tariff", { length: 100 }),
  /** Platform where the ad appears (e.g. Сетка, MAX, TG) */
  platform: varchar("platform", { length: 255 }),
  /** SPM value */
  spm: varchar("spm", { length: 100 }),
  /** Reach / audience size (e.g. 500, 1000) — used for SPM cost calculation */
  reach: bigint("reach", { mode: "number" }),
  /** Revenue in rubles */
  cost: decimal("cost", { precision: 12, scale: 2 }),
  /** Payment status */
  paymentStatus: mysqlEnum("paymentStatus", ["paid", "unpaid", "partial"]).default("unpaid").notNull(),
  /** Month label for grouping (e.g. "2026-05") */
  month: varchar("month", { length: 7 }).notNull(),
  /** Post not needed — autobot handles posting automatically */
  postNotNeeded: boolean("postNotNeeded").default(false).notNull(),
  /** Approximate subscriber count of the buyer's channel (for size analysis) */
  buyerSubscribers: bigint("buyerSubscribers", { mode: "number" }),
  /** Mutual subscription deal (ВП) flag */
  isMutual: boolean("isMutual").default(false).notNull(),
  /** Partner channel name for ВП */
  partnerChannel: varchar("partnerChannel", { length: 255 }),
  /** Our reach for ВП deal */
  ourReach: bigint("ourReach", { mode: "number" }),
  /** Partner reach for ВП deal */
  partnerReach: bigint("partnerReach", { mode: "number" }),
  /** Doplate direction: who pays whom */
  dopDirection: mysqlEnum("dopDirection", ["we_pay", "they_pay", "none"]).default("none"),
  /** Doplate amount in rubles */
  dopAmount: decimal("dopAmount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SaleRecord = typeof saleRecords.$inferSelect;
export type InsertSaleRecord = typeof saleRecords.$inferInsert;

/**
 * Channel assignments — links team members (buyers/managers) to specific channels.
 * Admin assigns which channels each team member can work with.
 */
export const channelAssignments = mysqlTable("channel_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // the team member
  channelId: int("channelId").notNull(), // the assigned channel
  assignedBy: int("assignedBy").notNull(), // admin who made the assignment
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChannelAssignment = typeof channelAssignments.$inferSelect;
export type InsertChannelAssignment = typeof channelAssignments.$inferInsert;

/**
 * Mutual subscription deals (Взаимки / ВП).
 * Tracks barter ad exchanges between channels, with optional doplate for reach difference.
 */
export const mutualDeals = mysqlTable("mutual_deals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Our channel participating in the deal (primary, kept for compatibility) */
  ourChannelId: int("ourChannelId").notNull(),
  /** Additional channels participating in the deal (JSON array of channel IDs) */
  ourChannelIds: text("ourChannelIds"),
  /** Partner channel name (external, free text) */
  partnerChannelName: varchar("partnerChannelName", { length: 255 }).notNull(),
  /** Partner contact (admin name, username, etc.) */
  partnerContact: varchar("partnerContact", { length: 255 }),
  /** Planned placement date (legacy, kept for compatibility) */
  dealDate: timestamp("dealDate"),
  /** Date our post was placed */
  ourPostDate: timestamp("ourPostDate"),
  /** Date partner post was placed */
  partnerPostDate: timestamp("partnerPostDate"),
  /** Our channel reach for this deal */
  ourReach: bigint("ourReach", { mode: "number" }),
  /** Partner channel reach */
  partnerReach: bigint("partnerReach", { mode: "number" }),
  /** Auto-created sale record ID (our post placed in our channel) */
  saleRecordId: int("saleRecordId"),
  /** Auto-created purchase record ID (partner post placed in our channel) */
  purchaseRecordId: int("purchaseRecordId"),
  /** Deal type: without doplate or with doplate */
  dealType: mysqlEnum("dealType", ["без доплаты", "с доплатой"]).default("без доплаты").notNull(),
  /** Doplate direction: who pays whom */
  dopDirection: mysqlEnum("dopDirection", ["мы платим", "нам платят"]),
  /** Doplate amount in rubles */
  dopAmount: decimal("dopAmount", { precision: 12, scale: 2 }),
  /** Doplate payment status */
  dopPaymentStatus: mysqlEnum("dopPaymentStatus", ["paid", "unpaid", "not_applicable"]).default("not_applicable").notNull(),
  /** Link to our post */
  ourPostLink: varchar("ourPostLink", { length: 1024 }),
  /** Link to partner post */
  partnerPostLink: varchar("partnerPostLink", { length: 1024 }),
  /** Deal lifecycle status */
  status: mysqlEnum("status", ["предложение", "согласовано", "размещено", "завершено", "отменено"]).default("предложение").notNull(),
  /** Month label for grouping */
  month: varchar("month", { length: 7 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MutualDeal = typeof mutualDeals.$inferSelect;
export type InsertMutualDeal = typeof mutualDeals.$inferInsert;

/**
 * Weekly subscriber snapshots for our channels.
 * Owner inputs subscriber count once a week per channel.
 * Used for CPF (Cost Per Follower) analytics.
 */
export const channelSubscriberSnapshots = mysqlTable("channel_subscriber_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  channelId: int("channelId").notNull(),
  /** Subscriber count at the time of snapshot */
  subscriberCount: bigint("subscriberCount", { mode: "number" }).notNull(),
  /** Date of the snapshot (YYYY-MM-DD stored as timestamp) */
  snapshotDate: timestamp("snapshotDate").notNull(),
  notes: text("notes"),
  /** Trustat-style reach metrics */
  views24h: int("views24h"),
  views48h: int("views48h"),
  views72h: int("views72h"),
  /** ER24 — engagement rate over 24h (percentage, e.g. 13.93) */
  er24: decimal("er24", { precision: 6, scale: 2 }),
  /** Weekly subscriber growth (positive or negative) */
  weeklyGrowth: int("weeklyGrowth"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChannelSubscriberSnapshot = typeof channelSubscriberSnapshots.$inferSelect;
export type InsertChannelSubscriberSnapshot = typeof channelSubscriberSnapshots.$inferInsert;

/**
 * Operational expenses (Расходы).
 * Tracks costs like content writer salary, buyer salary, etc.
 */
export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Month label for grouping (e.g. "2026-06") */
  month: varchar("month", { length: 7 }).notNull(),
  /** Category: контентщик, закупщик, прочее, etc. */
  category: varchar("category", { length: 100 }).notNull(),
  /** Description / comment */
  description: text("description"),
  /** Amount in rubles */
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  /** Payment status */
  paymentStatus: mysqlEnum("paymentStatus", ["paid", "unpaid"]).default("unpaid").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

/**
 * Post analytics fetched from Trustat (anypost.trustat.me) or similar services.
 * Auto-fetched when a sale/purchase record status changes to "paid".
 */
export const postAnalytics = mysqlTable("post_analytics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** "sale" or "purchase" */
  recordType: mysqlEnum("recordType", ["sale", "purchase"]).notNull(),
  recordId: int("recordId").notNull(),
  /** The analytics URL that was fetched */
  url: varchar("url", { length: 2048 }).notNull(),
  /** Post title / draft name */
  postTitle: text("postTitle"),
  /** Total current views across all channels */
  totalViews: int("totalViews"),
  /** Views in first 24h */
  views24h: int("views24h"),
  /** Views in first 48h */
  views48h: int("views48h"),
  /** Views in first 72h */
  views72h: int("views72h"),
  /** ERR (engagement rate) 24h as percentage */
  err24h: decimal("err24h", { precision: 6, scale: 2 }),
  /** Total subscribers across all channels in the report */
  totalSubscribers: int("totalSubscribers"),
  /** Number of channels in the report */
  channelCount: int("channelCount"),
  /** JSON array of per-channel breakdown */
  channelsJson: text("channelsJson"),
  /** Raw JSON of the full report for AI context */
  rawJson: text("rawJson"),
  /** When this data was fetched */
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PostAnalytics = typeof postAnalytics.$inferSelect;
export type InsertPostAnalytics = typeof postAnalytics.$inferInsert;
