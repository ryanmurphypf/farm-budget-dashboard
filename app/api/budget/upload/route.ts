import { NextRequest, NextResponse } from "next/server";
import { getDb, DB_DIR } from "@/lib/db";
import { parseBudgetXlsx } from "@/lib/parse-budget";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".xlsx") && !ext.endsWith(".xlsm")) {
    return NextResponse.json({ error: "File must be .xlsx or .xlsm" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let entries;
  try {
    entries = parseBudgetXlsx(buffer);
  } catch (err) {
    console.error("Budget parse error:", err);
    return NextResponse.json(
      { error: "Failed to parse workbook — check that PFP Proj, PGE Proj and LGC Proj sheets exist" },
      { status: 422 }
    );
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No Income or Expenses rows found — verify the Class column (col U) in the Proj sheets" },
      { status: 422 }
    );
  }

  // Save file to disk for later download
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(path.join(DB_DIR, "budget_upload.xlsx"), buffer);

  const db = getDb();
  const clear = db.prepare("DELETE FROM budget_entries");
  const ins = db.prepare(`
    INSERT INTO budget_entries (entity, acct, acct_desc, class, subclass, detail, int_ext, ye_total, q1, q2, q3, q4)
    VALUES (@entity, @acct, @acct_desc, @class, @subclass, @detail, @int_ext, @ye_total, @q1, @q2, @q3, @q4)
  `);

  db.transaction(() => {
    clear.run();
    for (const e of entries) ins.run(e);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("budget_filename", file.name);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("budget_uploaded_at", new Date().toISOString());
  })();

  return NextResponse.json({ ok: true, count: entries.length, filename: file.name, timestamp: new Date().toISOString() });
}
