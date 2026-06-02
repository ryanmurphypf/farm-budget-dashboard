import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseActualsXlsx } from "@/lib/parse-actuals";

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

  let result;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
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

  const db = getDb();
  const clear = db.prepare("DELETE FROM actual_entries");
  const ins = db.prepare(`
    INSERT INTO actual_entries (acct, acct_desc, class, pfp, pge, lgc, elim, combined, as_of_date)
    VALUES (@acct, @acct_desc, @class, @pfp, @pge, @lgc, @elim, @combined, @as_of_date)
  `);

  db.transaction(() => {
    clear.run();
    for (const e of result.entries) {
      ins.run({ ...e, as_of_date: result.as_of_date });
    }
  })();

  return NextResponse.json({
    ok: true,
    count: result.entries.length,
    as_of_date: result.as_of_date,
    filename: file.name,
  });
}
