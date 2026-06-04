import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = await getDb();
  const result = await db.query(
    "SELECT filename, data FROM uploaded_files WHERE key = 'budget'"
  );
  if (result.rows.length === 0)
    return NextResponse.json({ error: "No budget file uploaded yet" }, { status: 404 });

  const { filename, data } = result.rows[0];
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
