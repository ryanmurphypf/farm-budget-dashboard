import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const VALID_PERIODS = ["q1", "q2", "q3", "q4"] as const;

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period");
  if (!period || !VALID_PERIODS.includes(period as typeof VALID_PERIODS[number]))
    return NextResponse.json({ error: "Missing or invalid period — must be q1, q2, q3, or q4" }, { status: 400 });

  const db = await getDb();
  const result = await db.query(
    "SELECT filename, data FROM uploaded_files WHERE key = $1",
    [`actuals_${period}`]
  );
  if (result.rows.length === 0)
    return NextResponse.json({ error: `No actuals file uploaded for ${period.toUpperCase()}` }, { status: 404 });

  const { filename, data } = result.rows[0];
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
