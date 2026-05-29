import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { PeriodKey } from "@/lib/constants";

const VALID_PERIODS: PeriodKey[] = ["ye_total", "q1", "q2", "q3", "q4"];
const VALID_ENTITIES = ["Combined", "PFP", "PGE", "LGC"];

export type AccountRow = {
  acct: string;
  acct_desc: string;
  value: number;
};

export type DetailRow = {
  detail: string;
  value: number;
  accounts: AccountRow[];
};

export type SubclassRow = {
  subclass: string;
  value: number;
  details: DetailRow[];
};

export type ClassRow = {
  class: string;
  value: number;
  subclasses: SubclassRow[];
};

export type BudgetResponse = {
  entity: string;
  period: string;
  classes: ClassRow[];
  net_income: number;
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const entity = searchParams.get("entity") || "Combined";
  const period = (searchParams.get("period") || "ye_total") as PeriodKey;
  const showZeros = searchParams.get("showZeros") === "true";

  if (!VALID_ENTITIES.includes(entity)) {
    return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const db = getDb();

  const entityFilter = entity === "Combined" ? "" : "AND entity = ?";
  const entityArgs = entity === "Combined" ? [] : [entity];

  const sql = `
    SELECT
      class,
      subclass,
      detail,
      acct,
      acct_desc,
      SUM(${period}) as value
    FROM budget_entries
    WHERE class IN ('Income', 'Expenses')
    ${entityFilter}
    GROUP BY class, subclass, detail, acct, acct_desc
    ORDER BY class, subclass, detail, acct
  `;

  const rows = db.prepare(sql).all(...entityArgs) as {
    class: string;
    subclass: string;
    detail: string;
    acct: string;
    acct_desc: string;
    value: number;
  }[];

  // Build hierarchy
  const classMap = new Map<string, Map<string, Map<string, AccountRow[]>>>();

  for (const row of rows) {
    if (!showZeros && row.value === 0) continue;

    const subclassLabel = row.subclass || "Other";
    const detailLabel = row.detail || "";

    if (!classMap.has(row.class)) classMap.set(row.class, new Map());
    const subMap = classMap.get(row.class)!;
    if (!subMap.has(subclassLabel)) subMap.set(subclassLabel, new Map());
    const detMap = subMap.get(subclassLabel)!;
    if (!detMap.has(detailLabel)) detMap.set(detailLabel, []);
    detMap.get(detailLabel)!.push({
      acct: row.acct,
      acct_desc: row.acct_desc,
      value: row.value,
    });
  }

  const classes: ClassRow[] = [];
  let incomeTot = 0;
  let expenseTot = 0;

  // Ensure consistent class ordering
  const classOrder = ["Income", "Expenses"];
  for (const cls of classOrder) {
    const subMap = classMap.get(cls);
    if (!subMap) continue;

    const subclasses: SubclassRow[] = [];
    let classTotal = 0;

    for (const [subclass, detMap] of subMap) {
      const details: DetailRow[] = [];
      let subTotal = 0;

      for (const [detail, accounts] of detMap) {
        const detTotal = accounts.reduce((s, a) => s + a.value, 0);
        subTotal += detTotal;
        details.push({ detail, value: detTotal, accounts });
      }

      classTotal += subTotal;
      subclasses.push({ subclass, value: subTotal, details });
    }

    // Sort subclasses by absolute value descending
    subclasses.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    classes.push({ class: cls, value: classTotal, subclasses });
    if (cls === "Income") incomeTot = classTotal;
    if (cls === "Expenses") expenseTot = classTotal;
  }

  return NextResponse.json({
    entity,
    period,
    classes,
    net_income: incomeTot - expenseTot,
  } satisfies BudgetResponse);
}
