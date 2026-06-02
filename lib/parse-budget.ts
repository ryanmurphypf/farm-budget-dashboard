import * as xlsx from "xlsx";
import type { BudgetEntry } from "./db";

const SHEET_TO_ENTITY: Record<string, string> = {
  "PFP Proj": "PFP",
  "PGE Proj": "PGE",
  "LGC Proj": "LGC",
};

export function parseBudgetXlsx(buffer: Buffer): BudgetEntry[] {
  const wb = xlsx.read(buffer, { type: "buffer" });
  const entries: BudgetEntry[] = [];

  for (const [sheetName, entity] of Object.entries(SHEET_TO_ENTITY)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.warn(`Sheet "${sheetName}" not found in workbook`);
      continue;
    }

    // Row 0 = headers (Acct, Acct. Desc., YE 1.31.27, YTD, Q4, Q3, Q2, Q1, ..., Class, I/S, Subclass, Detail, ...)
    const data = xlsx.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    }) as (string | number)[][];

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const cls = String(r[20] ?? "").trim();
      if (cls !== "Income" && cls !== "Expenses") continue;

      const yeTotal = parseFloat(String(r[2])) || 0;
      const q4 = parseFloat(String(r[4])) || 0;
      const q3 = parseFloat(String(r[5])) || 0;
      const q2 = parseFloat(String(r[6])) || 0;
      const q1 = parseFloat(String(r[7])) || 0;

      entries.push({
        entity,
        acct: String(r[0]).trim(),
        acct_desc: String(r[1]).trim(),
        class: cls,
        subclass: String(r[22] ?? "").trim(),
        detail: String(r[23] ?? "").trim(),
        int_ext: String(r[24] ?? "").trim(),
        ye_total: Math.round(yeTotal * 100) / 100,
        q1: Math.round(q1 * 100) / 100,
        q2: Math.round(q2 * 100) / 100,
        q3: Math.round(q3 * 100) / 100,
        q4: Math.round(q4 * 100) / 100,
      });
    }
  }

  return entries;
}
