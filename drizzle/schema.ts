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
  /** Bot / stories flag */
  botStories: varchar("botStories", { length: 255 }),
  /** Bot / stories payment amount */
  botStoriesCost: decimal("botStoriesCost", { precision: 12, scale: 2 }),
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
  /** Bot / stories flag */
  botStories: varchar("botStories", { length: 255 }),
  /** Bot / stories payment amount */
  botStoriesCost: decimal("botStoriesCost", { precision: 12, scale: 2 }),
  /** Month label for grouping (e.g. "2026-05") */
  month: varchar("month", { length: 7 }).notNull(),
  /** Post not needed — autobot handles posting automatically */
  postNotNeeded: boolean("postNotNeeded").default(false).notNull(),
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
