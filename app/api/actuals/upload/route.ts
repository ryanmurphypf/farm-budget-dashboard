import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseActualsXlsx } from "@/lib/parse-actuals";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".xlsx") && !ext.endsWith(".xlsm"))
    return NextResponse.json({ error: "File must be .xlsx or .xlsm" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try { result = parseActualsXlsx(buffer); }
  catch (err) {
    console.error("Actuals parse error:", err);
    return NextResponse.json(
      { error: 'Failed to parse workbook — check that "Combined Actual IS" sheet exists' },
      { status: 422 }
    );
  }

  if (result.entries.length === 0)
    return NextResponse.json({ error: "No Income or Expense rows found" }, { status: 422 });

  const db = await getDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM actual_entries");
    const BATCH = 100;
    for (let i = 0; i < result.entries.length; i += BATCH) {
      const chunk = result.entries.slice(i, i + BATCH);
      const values: unknown[] = [];
      const placeholders = chunk.map((e, j) => {
        const b = j * 9;
        values.push(e.acct, e.acct_desc, e.class, e.pfp, e.pge, e.lgc, e.elim, e.combined, result.end_date);
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
      }).join(",");
      await client.query(
        `INSERT INTO actual_entries (acct,acct_desc,class,pfp,pge,lgc,elim,combined,as_of_date) VALUES ${placeholders}`,
        values
      );
    }

    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO uploaded_files (key, filename, data, uploaded_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (key) DO UPDATE SET filename=EXCLUDED.filename, data=EXCLUDED.data, uploaded_at=EXCLUDED.uploaded_at`,
      ["actuals", file.name, buffer, now]
    );
    for (const [k, v] of [
      ["actuals_filename", file.name],
      ["actuals_uploaded_at", now],
      ["actuals_beg_date", result.beg_date],
      ["actuals_end_date", result.end_date],
    ]) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
        [k, v]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, count: result.entries.length, beg_date: result.beg_date, end_date: result.end_date, filename: file.name });
}
