import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";

function resolveDbDir(): string {
  const candidates = [
    process.env.DATABASE_DIR,
    path.join(process.cwd(), "data"),
    path.join("/tmp", "pfp-budget-data"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Verify we can actually write here
      fs.writeFileSync(path.join(dir, ".write-test"), "ok");
      fs.unlinkSync(path.join(dir, ".write-test"));
      return dir;
    } catch {
      console.warn(`DB dir not writable: ${dir}, trying next...`);
    }
  }
  throw new Error("No writable directory found for SQLite database");
}

export const DB_DIR = resolveDbDir();
const DB_PATH = path.join(DB_DIR, "db.sqlite");

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!global.__db) {
    global.__db = new Database(DB_PATH);
    global.__db.pragma("journal_mode = WAL");
    initSchema(global.__db);
  }
  return global.__db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      acct TEXT NOT NULL,
      acct_desc TEXT NOT NULL,
      class TEXT NOT NULL,
      subclass TEXT NOT NULL,
      detail TEXT DEFAULT '',
      int_ext TEXT DEFAULT '',
      ye_total REAL DEFAULT 0,
      q1 REAL DEFAULT 0,
      q2 REAL DEFAULT 0,
      q3 REAL DEFAULT 0,
      q4 REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_budget_entity ON budget_entries(entity);
    CREATE INDEX IF NOT EXISTS idx_budget_class ON budget_entries(class);
    CREATE INDEX IF NOT EXISTS idx_budget_int_ext ON budget_entries(int_ext);

    CREATE TABLE IF NOT EXISTS actual_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      acct TEXT NOT NULL,
      acct_desc TEXT NOT NULL,
      class TEXT NOT NULL,
      pfp REAL DEFAULT 0,
      pge REAL DEFAULT 0,
      lgc REAL DEFAULT 0,
      elim REAL DEFAULT 0,
      combined REAL DEFAULT 0,
      as_of_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_actual_acct ON actual_entries(acct);
    CREATE INDEX IF NOT EXISTS idx_actual_class ON actual_entries(class);
  `);

  const pw = db.prepare("SELECT value FROM settings WHERE key = ?").get("password_hash");
  if (!pw) {
    const hash = bcrypt.hashSync(process.env.DASHBOARD_PASSWORD || "PetersonFarms2026!", 10);
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("password_hash", hash);
  }

  const count = (db.prepare("SELECT COUNT(*) as c FROM budget_entries").get() as { c: number }).c;
  if (count === 0) seedBudget(db);
}

function seedBudget(db: Database.Database) {
  const seedPath = path.join(process.cwd(), "seed", "budget.json");
  if (!fs.existsSync(seedPath)) {
    console.warn("Seed file not found at", seedPath);
    return;
  }
  const entries = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as BudgetEntry[];
  const ins = db.prepare(`
    INSERT INTO budget_entries (entity, acct, acct_desc, class, subclass, detail, int_ext, ye_total, q1, q2, q3, q4)
    VALUES (@entity, @acct, @acct_desc, @class, @subclass, @detail, @int_ext, @ye_total, @q1, @q2, @q3, @q4)
  `);
  const run = db.transaction((rows: BudgetEntry[]) => {
    rows.forEach((r) => ins.run(r));
  });
  run(entries);
  console.log(`Seeded ${entries.length} budget entries`);
}

export type BudgetEntry = {
  entity: string;
  acct: string;
  acct_desc: string;
  class: string;
  subclass: string;
  detail: string;
  int_ext: string;
  ye_total: number;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
};

export type { PeriodKey, EntityKey } from "./constants";
export { PERIODS, ENTITIES } from "./constants";
