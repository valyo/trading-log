import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "trades.db");
const sqlite = new Database(dbPath);

function runMigrationIfNeeded(filename: string, tableName: string) {
  const exists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  if (exists) return;
  const migrationPath = path.join(process.cwd(), "drizzle", filename);
  if (fs.existsSync(migrationPath)) {
    const sql = fs.readFileSync(migrationPath, "utf8");
    sqlite.exec(sql);
  }
}

runMigrationIfNeeded("0000_initial.sql", "trades");
runMigrationIfNeeded("0001_price_series.sql", "price_series");

export const db = drizzle(sqlite, { schema });
