import { sql } from "drizzle-orm";
import { getDb } from "./db";

let reachVerificationSchemaReady: Promise<void> | null = null;

export function isDuplicateColumnError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current !== "object") return false;
    const details = current as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (details.code === "ER_DUP_FIELDNAME" || details.errno === 1060) return true;
    if (typeof details.message === "string" && /duplicate column|duplicate field|already exists/i.test(details.message)) return true;
    current = details.cause;
  }
  return false;
}

async function addColumn(
  table: "channel_creatives" | "purchase_records" | "sale_records",
  definition: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${definition}`));
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }
}

/** Ensures reach-correction columns exist before any query selects them. */
export function ensureReachVerificationSchema(): Promise<void> {
  if (!reachVerificationSchemaReady) {
    reachVerificationSchemaReady = (async () => {
      for (const table of ["purchase_records", "sale_records"] as const) {
        await addColumn(table, "reachVerifiedValue BIGINT NULL AFTER reach");
        await addColumn(table, "reachVerifiedLink VARCHAR(1024) NULL AFTER reachVerifiedValue");
        await addColumn(table, "reachVerifiedAt TIMESTAMP NULL AFTER reachVerifiedLink");
      }
    })().catch((error) => {
      reachVerificationSchemaReady = null;
      throw error;
    });
  }
  return reachVerificationSchemaReady;
}

/** The VPS deploy does not run Drizzle migrations, so keep this additive schema change idempotent at startup. */
export async function ensureCreativeSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS channel_creatives (
      id INT NOT NULL AUTO_INCREMENT,
      userId INT NOT NULL,
      channelId INT NOT NULL,
      title VARCHAR(255),
      postText TEXT,
      recognizedText TEXT,
      imagePath VARCHAR(1024),
      imageMime VARCHAR(100),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX channel_creatives_user_channel_idx (userId, channelId)
    )
  `));
  await addColumn("channel_creatives", "recognizedText TEXT AFTER postText");
  await ensureReachVerificationSchema();
}
