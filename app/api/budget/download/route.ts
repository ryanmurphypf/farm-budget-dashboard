import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

const DB_DIR = process.env.DATABASE_DIR || path.join(process.cwd(), "data");

export async function GET() {
  const filePath = path.join(DB_DIR, "budget_upload.xlsx");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "No budget file uploaded yet" }, { status: 404 });
  }

  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'budget_filename'").get() as { value: string } | undefined;
  const filename = row?.value ?? "budget.xlsx";

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
