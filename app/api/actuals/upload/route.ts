import { NextRequest, NextResponse } from "next/server";
import { getDb, DB_DIR } from "@/lib/db";
import { parseActualsXlsx } from "@/lib/parse-actuals";
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

  let result;
  try {
    result = parseActualsXlsx(buffer);
  } catch (err) {
    console.error("Actuals parse error:", err);
    return NextResponse.json(
      { error: 'Failed to parse workbook — check that "Combined Actual IS" sheet exists' },
      { status: 422 }
    );
  }

  if (result.entries.length === 0) {
    return NextResponse.json(
      { error: "No Income or Expense rows found in Combined Actual IS sheet" },
      { status: 422 }
    );
  }

  // Save file to disk for later download
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(path.join(DB_DIR, "actuals_upload.xlsx"), buffer);

  const db = getDb();
  const clear = db.prepare("DELETE FROM actual_entries");
  const ins = db.prepare(`
    INSERT INTO actual_entries (acct, acct_desc, class, pfp, pge, lgc, elim, combined, as_of_date)
    VALUES (@acct, @acct_desc, @class, @pfp, @pge, @lgc, @elim, @combined, @as_of_date)
  `);

  db.transaction(() => {
    clear.run();
    for (const e of result.entries) ins.run({ ...e, as_of_date: result.end_date });
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("actuals_filename", file.name);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("actuals_uploaded_at", new Date().toISOString());
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("actuals_beg_date", result.beg_date);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("actuals_end_date", result.end_date);
  })();

  return NextResponse.json({
    ok: true,
    count: result.entries.length,
    beg_date: result.beg_date,
    end_date: result.end_date,
    filename: file.name,
  });
}
