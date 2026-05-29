import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseBudgetXlsx } from "@/lib/parse-budget";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".xlsx") && !ext.endsWith(".xlsm")) {
    return NextResponse.json(
      { error: "File must be a .xlsx or .xlsm workbook" },
      { status: 400 }
    );
  }

  let entries;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
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

  const db = getDb();
  const clear = db.prepare("DELETE FROM budget_entries");
  const ins = db.prepare(`
    INSERT INTO budget_entries (entity, acct, acct_desc, class, subclass, detail, ye_total, q1, q2, q3, q4)
    VALUES (@entity, @acct, @acct_desc, @class, @subclass, @detail, @ye_total, @q1, @q2, @q3, @q4)
  `);

  db.transaction(() => {
    clear.run();
    for (const e of entries) ins.run(e);
  })();

  return NextResponse.json({
    ok: true,
    count: entries.length,
    filename: file.name,
    timestamp: new Date().toISOString(),
  });
}
