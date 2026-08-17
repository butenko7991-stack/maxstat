import { sql } from "drizzle-orm";
import { getDb } from "./db";

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
  await db.execute(sql.raw("ALTER TABLE channel_creatives ADD COLUMN IF NOT EXISTS recognizedText TEXT AFTER postText"));
}
