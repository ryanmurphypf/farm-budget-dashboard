import { Pool } from "pg";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";

// ── Connection pool ──────────────────────────────────────────────────────────
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 10,
    });
  }
  return pool;
}

// Lazy init — only runs once, concurrent callers await the same promise
let initPromise: Promise<Pool> | null = null;

export async function getDb(): Promise<Pool> {
  if (!initPromise) initPromise = initSchema();
  return initPromise;
}

// ── Schema ───────────────────────────────────────────────────────────────────
async function initSchema(): Promise<Pool> {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_entries (
      id SERIAL PRIMARY KEY,
      entity TEXT NOT NULL,
      acct TEXT NOT NULL,
      acct_desc TEXT NOT NULL,
      class TEXT NOT NULL,
      subclass TEXT NOT NULL,
      detail TEXT DEFAULT '',
      int_ext TEXT DEFAULT '',
      ye_total DOUBLE PRECISION DEFAULT 0,
      q1 DOUBLE PRECISION DEFAULT 0,
      q2 DOUBLE PRECISION DEFAULT 0,
      q3 DOUBLE PRECISION DEFAULT 0,
      q4 DOUBLE PRECISION DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_budget_entity ON budget_entries(entity);
    CREATE INDEX IF NOT EXISTS idx_budget_class  ON budget_entries(class);
    CREATE INDEX IF NOT EXISTS idx_budget_intext ON budget_entries(int_ext);

    CREATE TABLE IF NOT EXISTS actual_entries (
      id SERIAL PRIMARY KEY,
      acct TEXT NOT NULL,
      acct_desc TEXT NOT NULL,
      class TEXT NOT NULL,
      pfp DOUBLE PRECISION DEFAULT 0,
      pge DOUBLE PRECISION DEFAULT 0,
      lgc DOUBLE PRECISION DEFAULT 0,
      elim DOUBLE PRECISION DEFAULT 0,
      combined DOUBLE PRECISION DEFAULT 0,
      as_of_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_actual_acct  ON actual_entries(acct);
    CREATE INDEX IF NOT EXISTS idx_actual_class ON actual_entries(class);

    CREATE TABLE IF NOT EXISTS uploaded_files (
      key TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      data BYTEA NOT NULL,
      uploaded_at TEXT NOT NULL
    );
  `);

  // Seed password if missing
  const pwRow = await p.query("SELECT value FROM settings WHERE key = 'password_hash'");
  if (pwRow.rows.length === 0) {
    const hash = await bcrypt.hash(process.env.DASHBOARD_PASSWORD || "PetersonFarms2026!", 10);
    await p.query("INSERT INTO settings (key, value) VALUES ($1, $2)", ["password_hash", hash]);
  }

  // Seed budget if empty
  const countRow = await p.query("SELECT COUNT(*)::int AS c FROM budget_entries");
  if (countRow.rows[0].c === 0) await seedBudget(p);

  return p;
}

// ── Budget seed ──────────────────────────────────────────────────────────────
async function seedBudget(p: Pool): Promise<void> {
  const seedFile = path.join(process.cwd(), "seed", "budget.json");
  if (!fs.existsSync(seedFile)) {
    console.warn("Seed file not found:", seedFile);
    return;
  }
  const entries = JSON.parse(fs.readFileSync(seedFile, "utf-8")) as BudgetEntry[];

  // Bulk insert in batches of 100
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const BATCH = 100;
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      const values: unknown[] = [];
      const placeholders = chunk.map((e, j) => {
        const base = j * 12;
        values.push(e.entity, e.acct, e.acct_desc, e.class, e.subclass, e.detail,
                    e.int_ext, e.ye_total, e.q1, e.q2, e.q3, e.q4);
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12})`;
      }).join(",");
      await client.query(
        `INSERT INTO budget_entries (entity,acct,acct_desc,class,subclass,detail,int_ext,ye_total,q1,q2,q3,q4) VALUES ${placeholders}`,
        values
      );
    }
    await client.query("COMMIT");
    console.log(`Seeded ${entries.length} budget entries`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
export type BudgetEntry = {
  entity: string; acct: string; acct_desc: string;
  class: string; subclass: string; detail: string; int_ext: string;
  ye_total: number; q1: number; q2: number; q3: number; q4: number;
};

export type { PeriodKey, EntityKey } from "./constants";
export { PERIODS, ENTITIES } from "./constants";
