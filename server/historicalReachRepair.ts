import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { saleRecords } from "../drizzle/schema";
import {
  getChannelsByUser,
  getDb,
  getPurchaseRecords,
  getSaleRecords,
  updatePurchaseRecord,
  updateSaleRecord,
} from "./db";

export const HISTORICAL_REACH_REPAIR_ANCHOR_SALE_ID = 4950161;
const MAX_ANALYTICS_HOST = "go.xn----7sbaab9baqgpd7d3b.xn--p1ai";
const reportPath = path.resolve(process.cwd(), "reports", `historical-reach-repair-${HISTORICAL_REACH_REPAIR_ANCHOR_SALE_ID}.json`);

type Candidate = {
  recordType: "sale" | "purchase";
  id: number;
  channelId: number;
  channelName: string;
  link: string;
  reach: number | null;
};

type DecisionStatus = "ready" | "same" | "ambiguous" | "no24h" | "unsupported" | "error";
type Decision = { status: DecisionStatus; proposedReach: number | null; error?: string };

export type HistoricalRepairSummary = {
  state: "running" | "completed" | "failed" | "not_started";
  workspaceId?: number;
  candidates?: number;
  supported?: number;
  updated?: number;
  same?: number;
  ambiguous?: number;
  no24h?: number;
  unsupported?: number;
  errors?: number;
  completedAt?: string;
  error?: string;
};

let inMemorySummary: HistoricalRepairSummary = { state: "not_started" };
let runningRepair: Promise<HistoricalRepairSummary> | null = null;

function normalizeChannelName(value: string | null | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function getHistoricalRepairApiUrl(link: string): string | null {
  const url = new URL(link);
  if (url.hostname.toLowerCase() !== MAX_ANALYTICS_HOST) return null;
  const match = url.pathname.match(/^\/ad\/(ad_[A-Za-z0-9_-]+)\/?$/);
  if (!match) return null;
  return new URL(`/api/ad/${encodeURIComponent(match[1])}?hours=48`, url.origin).toString();
}

export function decideHistoricalRepair(payload: unknown, channelName: string, currentReach: number | null): Decision {
  const root = payload && typeof payload === "object" ? payload as { channels?: unknown[] } : {};
  const posts = Array.isArray(root.channels) ? root.channels.map((item) => {
    const channel = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const reportAfter = asNumber(channel.reportAfter);
    const views24h = asNumber(channel.views24) ?? (reportAfter === 24 ? asNumber(channel.frozenViews) : null);
    return { channelTitle: typeof channel.channelTitle === "string" ? channel.channelTitle : null, views24h };
  }) : [];

  if (posts.length === 0) return { status: "no24h", proposedReach: null };
  const normalizedChannel = normalizeChannelName(channelName);
  const selected = posts.length === 1
    ? posts[0]
    : (() => {
        if (normalizedChannel.length < 3) return null;
        const matches = posts.filter((post) => {
          const normalizedPost = normalizeChannelName(post.channelTitle);
          return normalizedPost.length >= 3 && (normalizedPost.includes(normalizedChannel) || normalizedChannel.includes(normalizedPost));
        });
        return matches.length === 1 ? matches[0] : null;
      })();

  if (!selected) return { status: "ambiguous", proposedReach: null };
  if (selected.views24h === null || selected.views24h < 0) return { status: "no24h", proposedReach: null };
  if (asNumber(currentReach) === selected.views24h) return { status: "same", proposedReach: selected.views24h };
  return { status: "ready", proposedReach: selected.views24h };
}

async function readStoredSummary(): Promise<HistoricalRepairSummary | null> {
  try {
    return JSON.parse(await fs.readFile(reportPath, "utf8")) as HistoricalRepairSummary;
  } catch {
    return null;
  }
}

async function writeSummary(summary: HistoricalRepairSummary) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
}

async function runHistoricalReachRepair(): Promise<HistoricalRepairSummary> {
  const stored = await readStoredSummary();
  if (stored?.state === "completed") return stored;

  const db = await getDb();
  if (!db) throw new Error("База данных недоступна");
  const anchor = await db
    .select({ userId: saleRecords.userId })
    .from(saleRecords)
    .where(eq(saleRecords.id, HISTORICAL_REACH_REPAIR_ANCHOR_SALE_ID))
    .limit(1);
  const workspaceId = anchor[0]?.userId;
  if (!workspaceId) throw new Error(`Продажа #${HISTORICAL_REACH_REPAIR_ANCHOR_SALE_ID} не найдена`);

  const [channels, sales, purchases] = await Promise.all([
    getChannelsByUser(workspaceId),
    getSaleRecords(workspaceId, { paymentStatus: "paid" }),
    getPurchaseRecords(workspaceId, { paymentStatus: "paid" }),
  ]);
  const names = new Map(channels.map((channel) => [channel.id, channel.name]));
  const records: Candidate[] = [
    ...sales.filter((record) => Boolean(record.link?.startsWith("http"))).map((record) => ({
      recordType: "sale" as const, id: record.id, channelId: record.channelId,
      channelName: names.get(record.channelId) ?? `Канал #${record.channelId}`,
      link: record.link!, reach: record.reach ?? null,
    })),
    ...purchases.filter((record) => Boolean(record.link?.startsWith("http"))).map((record) => ({
      recordType: "purchase" as const, id: record.id, channelId: record.channelId,
      channelName: names.get(record.channelId) ?? `Канал #${record.channelId}`,
      link: record.link!, reach: record.reach ?? null,
    })),
  ];

  const summary: HistoricalRepairSummary = {
    state: "running", workspaceId, candidates: records.length, supported: 0, updated: 0,
    same: 0, ambiguous: 0, no24h: 0, unsupported: 0, errors: 0,
  };
  inMemorySummary = summary;

  for (const record of records) {
    const apiUrl = getHistoricalRepairApiUrl(record.link);
    if (!apiUrl) {
      summary.unsupported! += 1;
      continue;
    }
    try {
      const response = await fetch(apiUrl, {
        headers: { Accept: "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 (compatible; MaxAdsManager/1.0)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const decision = decideHistoricalRepair(await response.json(), record.channelName, record.reach);
      summary.supported! += 1;
      if (decision.status === "ready") {
        if (record.recordType === "sale") await updateSaleRecord(record.id, workspaceId, { reach: decision.proposedReach! });
        else await updatePurchaseRecord(record.id, workspaceId, { reach: decision.proposedReach! });
        summary.updated! += 1;
      } else if (decision.status === "same") summary.same! += 1;
      else if (decision.status === "ambiguous") summary.ambiguous! += 1;
      else summary.no24h! += 1;
    } catch (error) {
      summary.errors! += 1;
      console.warn(`[HistoricalReachRepair] ${record.recordType} #${record.id}: ${String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const completed: HistoricalRepairSummary = { ...summary, state: "completed", completedAt: new Date().toISOString() };
  inMemorySummary = completed;
  await writeSummary(completed);
  console.info("[HistoricalReachRepair]", JSON.stringify(completed));
  return completed;
}

export function startHistoricalReachRepair() {
  if (!runningRepair) {
    runningRepair = runHistoricalReachRepair().catch(async (error) => {
      const failed: HistoricalRepairSummary = { state: "failed", error: String(error), completedAt: new Date().toISOString() };
      inMemorySummary = failed;
      await writeSummary(failed);
      console.error("[HistoricalReachRepair]", error);
      return failed;
    });
  }
  return runningRepair;
}

export async function getHistoricalReachRepairStatus(): Promise<HistoricalRepairSummary> {
  return (await readStoredSummary()) ?? inMemorySummary;
}
