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

// Run initial migration if tables don't exist
const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='trades'").get();
if (!tables) {
  const migrationPath = path.join(process.cwd(), "drizzle", "0000_initial.sql");
  if (fs.existsSync(migrationPath)) {
    const sql = fs.readFileSync(migrationPath, "utf8");
    sqlite.exec(sql);
  }
}

export const db = drizzle(sqlite, { schema });
