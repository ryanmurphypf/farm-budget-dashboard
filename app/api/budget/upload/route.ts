import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseBudgetXlsx } from "@/lib/parse-budget";

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

  let entries;
  try { entries = parseBudgetXlsx(buffer); }
  catch (err) {
    console.error("Budget parse error:", err);
    return NextResponse.json(
      { error: "Failed to parse workbook — check that PFP Proj, PGE Proj and LGC Proj sheets exist" },
      { status: 422 }
    );
  }

  if (entries.length === 0)
    return NextResponse.json(
      { error: "No Income or Expenses rows found — verify the Class column in the Proj sheets" },
      { status: 422 }
    );

  const db = await getDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM budget_entries");
    const BATCH = 100;
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      const values: unknown[] = [];
      const placeholders = chunk.map((e, j) => {
        const b = j * 12;
        values.push(e.entity, e.acct, e.acct_desc, e.class, e.subclass, e.detail,
                    e.int_ext, e.ye_total, e.q1, e.q2, e.q3, e.q4);
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`;
      }).join(",");
      await client.query(
        `INSERT INTO budget_entries (entity,acct,acct_desc,class,subclass,detail,int_ext,ye_total,q1,q2,q3,q4) VALUES ${placeholders}`,
        values
      );
    }

    // Store file + metadata
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO uploaded_files (key, filename, data, uploaded_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (key) DO UPDATE SET filename=EXCLUDED.filename, data=EXCLUDED.data, uploaded_at=EXCLUDED.uploaded_at`,
      ["budget", file.name, buffer, now]
    );
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      ["budget_filename", file.name]
    );
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      ["budget_uploaded_at", now]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, count: entries.length, filename: file.name, timestamp: new Date().toISOString() });
}
