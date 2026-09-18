import { sql } from "drizzle-orm";
import { getDb } from "./db";

let reachVerificationSchemaReady: Promise<void> | null = null;
let invitationsSchemaReady: Promise<void> | null = null;

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

/** Supports both mysql2's [rows, fields] result and a plain rows array. */
export function invitationEmailColumnNeedsNullableUpgrade(result: unknown): boolean {
  if (!Array.isArray(result)) return false;
  const first = Array.isArray(result[0]) ? result[0][0] : result[0];
  return Boolean(
    first
    && typeof first === "object"
    && (first as { isNullable?: unknown }).isNullable === "NO",
  );
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

/** The VPS deploy does not run migrations, so create the additive invitation table at startup. */
export function ensureInvitationsSchema(): Promise<void> {
  if (!invitationsSchemaReady) {
    invitationsSchemaReady = (async () => {
      const db = await getDb();
      if (!db) return;
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS workspace_invitations (
          id INT NOT NULL AUTO_INCREMENT,
          tokenHash VARCHAR(64) NOT NULL,
          email VARCHAR(320) NULL,
          role ENUM('admin', 'buyer', 'manager') NOT NULL,
          workspaceId INT NOT NULL,
          createdByUserId INT NOT NULL,
          expiresAt TIMESTAMP NOT NULL,
          revokedAt TIMESTAMP NULL,
          acceptedAt TIMESTAMP NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY workspace_invitations_token_hash_unique (tokenHash),
          KEY workspace_invitations_workspace_state_idx (workspaceId, acceptedAt, revokedAt, expiresAt)
        )
      `));
      const emailColumn = await db.execute(sql.raw(`
        SELECT IS_NULLABLE AS isNullable
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'workspace_invitations'
          AND COLUMN_NAME = 'email'
        LIMIT 1
      `));
      if (invitationEmailColumnNeedsNullableUpgrade(emailColumn)) {
        await db.execute(sql.raw("ALTER TABLE workspace_invitations MODIFY COLUMN email VARCHAR(320) NULL"));
      }
    })().catch((error) => {
      invitationsSchemaReady = null;
      throw error;
    });
  }
  return invitationsSchemaReady;
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
  // VPS deployment unpacks the build without running Drizzle migrations.
  // Add this flag before sales.create can insert a new external record.
  await addColumn("sale_records", "isExternal BOOLEAN NOT NULL DEFAULT FALSE AFTER postNotNeeded");
  await ensureReachVerificationSchema();
  await ensureInvitationsSchema();
}
