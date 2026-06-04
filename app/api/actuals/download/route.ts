import { NextResponse } from "next/server";
import { getDb, DB_DIR } from "@/lib/db";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

export async function GET() {
  const filePath = path.join(DB_DIR, "actuals_upload.xlsx");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "No actuals file uploaded yet" }, { status: 404 });
  }

  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'actuals_filename'").get() as { value: string } | undefined;
  const filename = row?.value ?? "actuals.xlsx";

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
