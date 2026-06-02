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
  as_of_date: string; // ISO date string from Paste_Data row 2
};

export function parseActualsXlsx(buffer: Buffer): ActualsParseResult {
  const wb = xlsx.read(buffer, { type: "buffer" });

  // Extract as_of_date from Paste_Data sheet (row 2, col C = serial date)
  let as_of_date = new Date().toISOString().split("T")[0];
  const pasteWs = wb.Sheets["Paste_Data"];
  if (pasteWs) {
    const pasteData = xlsx.utils.sheet_to_json(pasteWs, {
      header: 1,
      defval: "",
    }) as (string | number)[][];
    const serial = pasteData[1]?.[2];
    if (typeof serial === "number" && serial > 40000) {
      // Convert Excel serial date to JS date
      const jsDate = new Date(Math.round((serial - 25569) * 86400 * 1000));
      as_of_date = jsDate.toISOString().split("T")[0];
    }
  }

  const ws = wb.Sheets["Combined Actual IS"];
  if (!ws) throw new Error('Sheet "Combined Actual IS" not found in workbook');

  // Columns: Class(0), Acct(1), Description(2), PFP(3), PGE(4), LGC(5), Elim(6), Total(7), ShowRow(8)
  const data = xlsx.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  }) as (string | number | boolean)[][];

  const entries: ActualEntry[] = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const rawClass = String(r[0] ?? "").trim();
    // Only include Income and Expense rows (actuals sheet uses "Expense" singular)
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
      pfp: Math.round(pfp * 100) / 100,
      pge: Math.round(pge * 100) / 100,
      lgc: Math.round(lgc * 100) / 100,
      elim: Math.round(elim * 100) / 100,
      combined: Math.round(combined * 100) / 100,
    });
  }

  return { entries, as_of_date };
}
