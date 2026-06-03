import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { PeriodKey } from "@/lib/constants";
import path from "path";
import fs from "fs";

const DB_DIR = process.env.DATABASE_DIR || path.join(process.cwd(), "data");

const VALID_PERIODS: PeriodKey[] = ["ye_total", "q1", "q2", "q3", "q4"];

export type EntityMetrics = {
  projected: number;
  actual: number;
  variance: number; // sign convention: actual - projected
};

export type AccountRow = {
  acct: string;
  acct_desc: string;
  combined: EntityMetrics;
  pfp: EntityMetrics;
  pge: EntityMetrics;
  lgc: EntityMetrics;
};

export type DetailRow = {
  detail: string;
  combined: EntityMetrics;
  pfp: EntityMetrics;
  pge: EntityMetrics;
  lgc: EntityMetrics;
  accounts: AccountRow[];
};

export type SubclassRow = {
  subclass: string;
  combined: EntityMetrics;
  pfp: EntityMetrics;
  pge: EntityMetrics;
  lgc: EntityMetrics;
  details: DetailRow[];
};

export type ClassRow = {
  class: string;
  combined: EntityMetrics;
  pfp: EntityMetrics;
  pge: EntityMetrics;
  lgc: EntityMetrics;
  subclasses: SubclassRow[];
};

export type EliminationRow = {
  acct: string;
  acct_desc: string;
  class: string;
  projected: number;
  actual: number;
};

export type DashboardResponse = {
  period: string;
  as_of_date: string | null;   // end date (kept for backwards compat)
  ytd_beg_date: string | null; // period start from Info sheet
  ytd_end_date: string | null; // period end from Info sheet
  has_actuals: boolean;
  has_budget_file: boolean;
  has_actuals_file: boolean;
  budget_filename: string | null;
  actuals_filename: string | null;
  classes: ClassRow[];
  net_income: {
    combined: EntityMetrics;
    pfp: EntityMetrics;
    pge: EntityMetrics;
    lgc: EntityMetrics;
  };
  eliminations: EliminationRow[];
};

type BudgetRow = {
  acct: string;
  acct_desc: string;
  class: string;
  subclass: string;
  detail: string;
  entity: string;
  value: number;
};

type ActualRow = {
  acct: string;
  acct_desc: string;
  class: string;
  pfp: number;
  pge: number;
  lgc: number;
  elim: number;
  combined: number;
};

function metrics(projected: number, actual: number): EntityMetrics {
  return { projected, actual, variance: actual - projected };
}

function zeroMetrics(): EntityMetrics {
  return { projected: 0, actual: 0, variance: 0 };
}

function addMetrics(a: EntityMetrics, b: EntityMetrics): EntityMetrics {
  return {
    projected: a.projected + b.projected,
    actual: a.actual + b.actual,
    variance: a.variance + b.variance,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const period = (searchParams.get("period") || "ye_total") as PeriodKey;
  const showZeros = searchParams.get("showZeros") === "true";

  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const db = getDb();

  // ── 1. Get per-entity projected rows ──────────────────────────────────────
  const budgetRows = db.prepare(`
    SELECT entity, class, subclass, detail, acct, acct_desc,
           SUM(${period}) as value
    FROM budget_entries
    WHERE class IN ('Income', 'Expenses')
    GROUP BY entity, class, subclass, detail, acct, acct_desc
    ORDER BY class, subclass, detail, acct
  `).all() as BudgetRow[];

  // Seed elimination: subtract LGC 41025+41026 from PFP 51120 in combined
  const { seedElim } = db.prepare(`
    SELECT COALESCE(SUM(${period}), 0) as seedElim
    FROM budget_entries WHERE entity = 'LGC' AND acct IN ('41025', '41026')
  `).get() as { seedElim: number };

  // Build projected maps: entity → acct → value
  const projMap: Record<string, Record<string, number>> = {
    PFP: {}, PGE: {}, LGC: {},
  };
  for (const r of budgetRows) {
    if (!projMap[r.entity]) projMap[r.entity] = {};
    projMap[r.entity][r.acct] = (projMap[r.entity][r.acct] ?? 0) + r.value;
  }

  // Combined projected = sum of external rows minus seed adjustment on 51120
  const combinedProjMap: Record<string, number> = {};
  for (const r of budgetRows) {
    if (r.entity === "PFP" || r.entity === "PGE" || r.entity === "LGC") {
      // For combined, skip Internal rows
      const intExtRow = db.prepare(
        "SELECT int_ext FROM budget_entries WHERE entity=? AND acct=? LIMIT 1"
      ).get(r.entity, r.acct) as { int_ext: string } | undefined;
      if (intExtRow?.int_ext === "Internal") continue;
      combinedProjMap[r.acct] = (combinedProjMap[r.acct] ?? 0) + r.value;
    }
  }
  // Apply seed elimination to combined projected
  if (seedElim !== 0 && combinedProjMap["51120"] !== undefined) {
    combinedProjMap["51120"] -= seedElim;
  }

  // ── 2. Get actuals ─────────────────────────────────────────────────────────
  const actualRows = db.prepare(`
    SELECT acct, acct_desc, class, pfp, pge, lgc, elim, combined
    FROM actual_entries
    ORDER BY class, acct
  `).all() as ActualRow[];

  const hasActuals = actualRows.length > 0;
  const asOfDate = hasActuals
    ? (db.prepare("SELECT as_of_date FROM actual_entries LIMIT 1").get() as { as_of_date: string })?.as_of_date ?? null
    : null;
  const ytdBegDate = hasActuals
    ? (db.prepare("SELECT value FROM settings WHERE key='actuals_beg_date'").get() as { value: string } | undefined)?.value ?? null
    : null;
  const ytdEndDate = hasActuals
    ? (db.prepare("SELECT value FROM settings WHERE key='actuals_end_date'").get() as { value: string } | undefined)?.value ?? asOfDate
    : null;

  // actuals maps: acct → value per entity
  const actualMap: Record<string, Record<string, number>> = {
    PFP: {}, PGE: {}, LGC: {}, combined: {},
  };
  for (const r of actualRows) {
    actualMap.PFP[r.acct] = r.pfp;
    actualMap.PGE[r.acct] = r.pge;
    actualMap.LGC[r.acct] = r.lgc;
    actualMap.combined[r.acct] = r.combined;
  }

  // ── 3. Build classification lookup from budget_entries ─────────────────────
  // For accounts in actuals that may not appear in budget, we still need class/subclass/detail
  const classifyMap = new Map<string, { class: string; subclass: string; detail: string; acct_desc: string }>();
  for (const r of budgetRows) {
    if (!classifyMap.has(r.acct)) {
      classifyMap.set(r.acct, {
        class: r.class,
        subclass: r.subclass,
        detail: r.detail,
        acct_desc: r.acct_desc,
      });
    }
  }
  // Also classify actuals-only accounts
  for (const r of actualRows) {
    if (!classifyMap.has(r.acct)) {
      classifyMap.set(r.acct, {
        class: r.class,
        subclass: "Other",
        detail: "",
        acct_desc: r.acct_desc,
      });
    }
  }

  // ── 4. Union of all account keys (projected + actual) ─────────────────────
  const allAccts = new Set<string>([
    ...Object.keys(combinedProjMap),
    ...Object.keys(projMap.PFP),
    ...Object.keys(projMap.PGE),
    ...Object.keys(projMap.LGC),
    ...Object.keys(actualMap.combined),
  ]);

  // ── 5. Build hierarchy ─────────────────────────────────────────────────────
  type HierKey = string; // `${class}|${subclass}|${detail}`
  const hierMap = new Map<HierKey, {
    class: string; subclass: string; detail: string;
    accounts: Map<string, AccountRow>;
  }>();

  for (const acct of allAccts) {
    const info = classifyMap.get(acct);
    if (!info) continue;

    const combProj = combinedProjMap[acct] ?? 0;
    const pfpProj = projMap.PFP[acct] ?? 0;
    const pgeProj = projMap.PGE[acct] ?? 0;
    const lgcProj = projMap.LGC[acct] ?? 0;
    const combAct = actualMap.combined[acct] ?? 0;
    const pfpAct = actualMap.PFP[acct] ?? 0;
    const pgeAct = actualMap.PGE[acct] ?? 0;
    const lgcAct = actualMap.LGC[acct] ?? 0;

    // Skip if all zeros and showZeros is false
    if (!showZeros) {
      const anyNonZero = [combProj, pfpProj, pgeProj, lgcProj, combAct, pfpAct, pgeAct, lgcAct].some(v => v !== 0);
      if (!anyNonZero) continue;
    }

    const acctRow: AccountRow = {
      acct,
      acct_desc: info.acct_desc,
      combined: metrics(combProj, combAct),
      pfp: metrics(pfpProj, pfpAct),
      pge: metrics(pgeProj, pgeAct),
      lgc: metrics(lgcProj, lgcAct),
    };

    const key: HierKey = `${info.class}|${info.subclass}|${info.detail}`;
    if (!hierMap.has(key)) {
      hierMap.set(key, { class: info.class, subclass: info.subclass, detail: info.detail, accounts: new Map() });
    }
    hierMap.get(key)!.accounts.set(acct, acctRow);
  }

  // ── 6. Aggregate into ClassRows ────────────────────────────────────────────
  // Group by class → subclass → detail
  const classMap = new Map<string, Map<string, Map<string, AccountRow[]>>>();
  for (const [, node] of hierMap) {
    const { class: cls, subclass, detail, accounts } = node;
    if (!classMap.has(cls)) classMap.set(cls, new Map());
    const subMap = classMap.get(cls)!;
    if (!subMap.has(subclass)) subMap.set(subclass, new Map());
    const detMap = subMap.get(subclass)!;
    if (!detMap.has(detail)) detMap.set(detail, []);
    detMap.get(detail)!.push(...accounts.values());
  }

  const classes: ClassRow[] = [];
  let netCombined = zeroMetrics();
  let netPfp = zeroMetrics();
  let netPge = zeroMetrics();
  let netLgc = zeroMetrics();

  for (const cls of ["Income", "Expenses"]) {
    const subMap = classMap.get(cls);
    if (!subMap) continue;

    const subclasses: SubclassRow[] = [];
    let classCombined = zeroMetrics();
    let classPfp = zeroMetrics();
    let classPge = zeroMetrics();
    let classLgc = zeroMetrics();

    for (const [subclass, detMap] of subMap) {
      const details: DetailRow[] = [];
      let subCombined = zeroMetrics();
      let subPfp = zeroMetrics();
      let subPge = zeroMetrics();
      let subLgc = zeroMetrics();

      for (const [detail, accounts] of detMap) {
        let detCombined = zeroMetrics();
        let detPfp = zeroMetrics();
        let detPge = zeroMetrics();
        let detLgc = zeroMetrics();
        for (const a of accounts) {
          detCombined = addMetrics(detCombined, a.combined);
          detPfp = addMetrics(detPfp, a.pfp);
          detPge = addMetrics(detPge, a.pge);
          detLgc = addMetrics(detLgc, a.lgc);
        }
        subCombined = addMetrics(subCombined, detCombined);
        subPfp = addMetrics(subPfp, detPfp);
        subPge = addMetrics(subPge, detPge);
        subLgc = addMetrics(subLgc, detLgc);
        details.push({ detail, combined: detCombined, pfp: detPfp, pge: detPge, lgc: detLgc, accounts });
      }

      classCombined = addMetrics(classCombined, subCombined);
      classPfp = addMetrics(classPfp, subPfp);
      classPge = addMetrics(classPge, subPge);
      classLgc = addMetrics(classLgc, subLgc);
      subclasses.push({ subclass, combined: subCombined, pfp: subPfp, pge: subPge, lgc: subLgc, details });
    }

    subclasses.sort((a, b) => Math.abs(b.combined.projected) - Math.abs(a.combined.projected));
    classes.push({ class: cls, combined: classCombined, pfp: classPfp, pge: classPge, lgc: classLgc, subclasses });

    // Net income = Income - Expenses
    const sign = cls === "Income" ? 1 : -1;
    netCombined = addMetrics(netCombined, { projected: sign * classCombined.projected, actual: sign * classCombined.actual, variance: sign * classCombined.variance });
    netPfp = addMetrics(netPfp, { projected: sign * classPfp.projected, actual: sign * classPfp.actual, variance: sign * classPfp.variance });
    netPge = addMetrics(netPge, { projected: sign * classPge.projected, actual: sign * classPge.actual, variance: sign * classPge.variance });
    netLgc = addMetrics(netLgc, { projected: sign * classLgc.projected, actual: sign * classLgc.actual, variance: sign * classLgc.variance });
  }

  // ── 7. Eliminations ────────────────────────────────────────────────────────
  const projElimRows = db.prepare(`
    SELECT acct, acct_desc, class, SUM(${period}) as value
    FROM budget_entries
    WHERE int_ext = 'Internal'
    GROUP BY acct, acct_desc, class
    HAVING value != 0
    ORDER BY class, acct
  `).all() as { acct: string; acct_desc: string; class: string; value: number }[];

  const actualElimMap = new Map<string, number>();
  for (const r of actualRows) {
    if (r.elim !== 0) actualElimMap.set(r.acct, r.elim);
  }

  // Merge projected and actual eliminations
  const elimAccts = new Set([
    ...projElimRows.map(r => r.acct),
    ...actualElimMap.keys(),
  ]);

  const eliminations: EliminationRow[] = [];
  const projElimMap = new Map(projElimRows.map(r => [r.acct, r]));

  for (const acct of elimAccts) {
    const pe = projElimMap.get(acct);
    const info = classifyMap.get(acct);
    eliminations.push({
      acct,
      acct_desc: pe?.acct_desc ?? info?.acct_desc ?? acct,
      class: pe?.class ?? info?.class ?? "",
      projected: pe?.value ?? 0,
      actual: actualElimMap.get(acct) ?? 0,
    });
  }
  eliminations.sort((a, b) => a.class.localeCompare(b.class) || a.acct.localeCompare(b.acct));

  // File availability for download links
  const hasBudgetFile = fs.existsSync(path.join(DB_DIR, "budget_upload.xlsx"));
  const hasActualsFile = fs.existsSync(path.join(DB_DIR, "actuals_upload.xlsx"));
  const budgetFilename = (db.prepare("SELECT value FROM settings WHERE key='budget_filename'").get() as { value: string } | undefined)?.value ?? null;
  const actualsFilename = (db.prepare("SELECT value FROM settings WHERE key='actuals_filename'").get() as { value: string } | undefined)?.value ?? null;

  return NextResponse.json({
    period,
    as_of_date: asOfDate,
    ytd_beg_date: ytdBegDate,
    ytd_end_date: ytdEndDate,
    has_actuals: hasActuals,
    has_budget_file: hasBudgetFile,
    has_actuals_file: hasActualsFile,
    budget_filename: budgetFilename,
    actuals_filename: actualsFilename,
    classes,
    net_income: { combined: netCombined, pfp: netPfp, pge: netPge, lgc: netLgc },
    eliminations,
  } satisfies DashboardResponse);
}
