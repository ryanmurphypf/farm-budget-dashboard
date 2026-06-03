import * as xlsx from "xlsx";

export type ActualEntry = {
  acct: string;
  acct_desc: string;
  class: string; // 'Income' or 'Expenses'
  pfp: number;
  pge: number;
  lgc: number;
  elim: number;
  combined: number; // = pfp + pge + lgc - elim (already in Total col)
};

export type ActualsParseResult = {
  entries: ActualEntry[];
  beg_date: string; // ISO date — from Info sheet "Beg Date"
  end_date: string; // ISO date — from Info sheet "End Date"
};

function excelSerialToISO(serial: number): string {
  // Excel serial: days since Dec 30 1899 (accounting for the 1900 leap-year bug)
  const jsDate = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return jsDate.toISOString().split("T")[0];
}

export function parseActualsXlsx(buffer: Buffer): ActualsParseResult {
  const wb = xlsx.read(buffer, { type: "buffer" });

  // ── Dates from Info sheet ────────────────────────────────────────────────
  let beg_date = "";
  let end_date = "";
  const infoWs = wb.Sheets["Info"];
  if (infoWs) {
    const infoData = xlsx.utils.sheet_to_json(infoWs, {
      header: 1,
      defval: "",
    }) as (string | number)[][];
    // Row 1: ["Beg Date", serial]   Row 2: ["End Date", serial]
    for (const row of infoData) {
      const label = String(row[0] ?? "").trim();
      const serial = row[1];
      if (label === "Beg Date" && typeof serial === "number" && serial > 40000) {
        beg_date = excelSerialToISO(serial);
      }
      if (label === "End Date" && typeof serial === "number" && serial > 40000) {
        end_date = excelSerialToISO(serial);
      }
    }
  }

  // Fallback: derive from Paste_Data col C if Info sheet missing
  if (!end_date) {
    const pasteWs = wb.Sheets["Paste_Data"];
    if (pasteWs) {
      const pasteData = xlsx.utils.sheet_to_json(pasteWs, { header: 1, defval: "" }) as (string | number)[][];
      const serial = pasteData[1]?.[2];
      if (typeof serial === "number" && serial > 40000) end_date = excelSerialToISO(serial);
    }
  }
  if (!beg_date) beg_date = end_date; // last resort
  if (!end_date) end_date = new Date().toISOString().split("T")[0];

  // ── Data from Combined Actual IS ─────────────────────────────────────────
  const ws = wb.Sheets["Combined Actual IS"];
  if (!ws) throw new Error('Sheet "Combined Actual IS" not found in workbook');

  const data = xlsx.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  }) as (string | number | boolean)[][];

  const entries: ActualEntry[] = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const rawClass = String(r[0] ?? "").trim();
    if (rawClass !== "Income" && rawClass !== "Expense") continue;

    const cls = rawClass === "Expense" ? "Expenses" : "Income";
    const acct = String(r[1] ?? "").trim();
    if (!acct) continue;

    const pfp = parseFloat(String(r[3])) || 0;
    const pge = parseFloat(String(r[4])) || 0;
    const lgc = parseFloat(String(r[5])) || 0;
    const elim = parseFloat(String(r[6])) || 0;
    const combined = parseFloat(String(r[7])) || 0;

    entries.push({
      acct,
      acct_desc: String(r[2] ?? "").trim(),
      class: cls,
      pfp:      Math.round(pfp      * 100) / 100,
      pge:      Math.round(pge      * 100) / 100,
      lgc:      Math.round(lgc      * 100) / 100,
      elim:     Math.round(elim     * 100) / 100,
      combined: Math.round(combined * 100) / 100,
    });
  }

  return { entries, beg_date, end_date };
}
