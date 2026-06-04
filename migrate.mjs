/**
 * Database migration script — run once after deploy on Railway:
 *   node migrate.mjs
 *
 * Or add to Railway's start command:
 *   node migrate.mjs && node dist/index.js
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

console.log("🔄 Running database migrations...");

const connection = await mysql.createConnection(connectionString);
const db = drizzle(connection);

await migrate(db, {
  migrationsFolder: path.join(__dirname, "drizzle"),
});

await connection.end();
console.log("✅ Migrations complete");
