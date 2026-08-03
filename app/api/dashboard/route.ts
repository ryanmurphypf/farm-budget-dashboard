import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { PeriodKey } from "@/lib/constants";

const VALID_PERIODS: PeriodKey[] = ["ye_total", "ytd", "q1", "q2", "q3", "q4"];
const EXCLUDED_ACCTS = "'41009','51028'"; // Held Grain — embedded as constants (not user input)

export type EntityMetrics = { projected: number; actual: number; variance: number };
export type AccountRow  = { acct: string; acct_desc: string; combined: EntityMetrics; pfp: EntityMetrics; pge: EntityMetrics; lgc: EntityMetrics };
export type DetailRow   = { detail: string; combined: EntityMetrics; pfp: EntityMetrics; pge: EntityMetrics; lgc: EntityMetrics; accounts: AccountRow[] };
export type SubclassRow = { subclass: string; combined: EntityMetrics; pfp: EntityMetrics; pge: EntityMetrics; lgc: EntityMetrics; details: DetailRow[] };
export type ClassRow    = { class: string; combined: EntityMetrics; pfp: EntityMetrics; pge: EntityMetrics; lgc: EntityMetrics; subclasses: SubclassRow[] };
export type EliminationRow = { acct: string; acct_desc: string; class: string; projected: number; actual: number };

export type ActualsPeriodMeta = {
  filename: string | null;
  beg_date: string | null;
  end_date: string | null;
  has_file: boolean;
};

export type DashboardResponse = {
  period: string;
  as_of_date: string | null;
  ytd_beg_date: string | null;
  ytd_end_date: string | null;
  has_actuals: boolean;
  has_budget_file: boolean;
  has_actuals_file: boolean;
  budget_filename: string | null;
  actuals_filename: string | null;
  actuals_periods: Record<string, ActualsPeriodMeta>;
  classes: ClassRow[];
  net_income: { combined: EntityMetrics; pfp: EntityMetrics; pge: EntityMetrics; lgc: EntityMetrics };
  eliminations: EliminationRow[];
};

function metrics(projected: number, actual: number): EntityMetrics {
  return { projected, actual, variance: actual - projected };
}
function zero(): EntityMetrics { return { projected: 0, actual: 0, variance: 0 }; }
function add(a: EntityMetrics, b: EntityMetrics): EntityMetrics {
  return { projected: a.projected + b.projected, actual: a.actual + b.actual, variance: a.variance + b.variance };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const period = (searchParams.get("period") || "ye_total") as PeriodKey;
  const showZeros = searchParams.get("showZeros") === "true";
  if (!VALID_PERIODS.includes(period))
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });

  const db = await getDb();

  // ── 0. Uploaded quarters — needed before budget query for YTD mode ─────────
  const ACTUAL_PERIODS = ["q1", "q2", "q3", "q4"] as const;
  const uploadedFilesRes = await db.query(
    "SELECT key FROM uploaded_files WHERE key = ANY($1)",
    [ACTUAL_PERIODS.map(p => `actuals_${p}`)]
  );
  const uploadedActualKeys = new Set(uploadedFilesRes.rows.map((r: { key: string }) => r.key));
  const uploadedQuarters = ACTUAL_PERIODS.filter(p => uploadedActualKeys.has(`actuals_${p}`));

  // Budget column expression:
  //   FY  → ye_total column
  //   YTD → sum of uploaded quarters' columns (e.g. "q1 + q2")
  //   Q1–Q4 → individual quarter column
  let budgetColExpr: string;
  if (period === "ytd") {
    budgetColExpr = uploadedQuarters.length > 0 ? uploadedQuarters.join(" + ") : "0";
  } else {
    budgetColExpr = period; // "ye_total", "q1", "q2", "q3", "q4"
  }

  // ── 1. Budget rows (include int_ext so we can filter combined inline) ──────
  const budgetRes = await db.query(`
    SELECT entity, class, subclass, detail, acct, acct_desc, int_ext,
           SUM(${budgetColExpr}) AS value
    FROM budget_entries
    WHERE class IN ('Income','Expenses') AND acct NOT IN (${EXCLUDED_ACCTS})
    GROUP BY entity, class, subclass, detail, acct, acct_desc, int_ext
    ORDER BY class, subclass, detail, acct
  `);
  const budgetRows = budgetRes.rows as { entity:string; class:string; subclass:string; detail:string; acct:string; acct_desc:string; int_ext:string; value:number }[];

  // Per-entity projected maps  acct → value
  const projMap: Record<string, Record<string, number>> = { PFP:{}, PGE:{}, LGC:{} };
  const combinedProjMap: Record<string, number> = {};

  for (const r of budgetRows) {
    projMap[r.entity] ??= {};
    projMap[r.entity][r.acct] = (projMap[r.entity][r.acct] ?? 0) + r.value;
    if (r.int_ext !== "Internal") {
      combinedProjMap[r.acct] = (combinedProjMap[r.acct] ?? 0) + r.value;
    }
  }

  // Seed elimination: LGC 41025+41026 subtracted from PFP 51120 in combined
  const seedRes = await db.query(`
    SELECT COALESCE(SUM(${budgetColExpr}),0)::float AS elim
    FROM budget_entries WHERE entity='LGC' AND acct IN ('41025','41026')
  `);
  const seedElim: number = seedRes.rows[0].elim ?? 0;
  if (seedElim !== 0 && combinedProjMap["51120"] !== undefined)
    combinedProjMap["51120"] -= seedElim;

  // ── 2. Actuals ─────────────────────────────────────────────────────────────
  // FY and YTD: sum all uploaded quarters grouped by acct.
  // Q1–Q4: pull that period only.
  let actualRows: { acct:string; acct_desc:string; class:string; pfp:number; pge:number; lgc:number; elim:number; combined:number }[];

  if (period === "ye_total" || period === "ytd") {
    const res = await db.query(`
      SELECT acct, MAX(acct_desc) AS acct_desc, MAX(class) AS class,
             SUM(pfp) AS pfp, SUM(pge) AS pge, SUM(lgc) AS lgc,
             SUM(elim) AS elim, SUM(combined) AS combined
      FROM actual_entries
      WHERE acct NOT IN (${EXCLUDED_ACCTS})
      GROUP BY acct
      ORDER BY MAX(class), acct
    `);
    actualRows = res.rows;
  } else {
    const res = await db.query(`
      SELECT acct, acct_desc, class, pfp, pge, lgc, elim, combined
      FROM actual_entries
      WHERE period = $1 AND acct NOT IN (${EXCLUDED_ACCTS})
      ORDER BY class, acct
    `, [period]);
    actualRows = res.rows;
  }

  const hasActuals = actualRows.length > 0;
  const actualMap: Record<string, { pfp:number; pge:number; lgc:number; combined:number }> = {};
  for (const r of actualRows) actualMap[r.acct] = { pfp: r.pfp, pge: r.pge, lgc: r.lgc, combined: r.combined };

  // Settings — load budget filename + all 4 period actuals metadata
  const settingsKeys = [
    "budget_filename",
    ...ACTUAL_PERIODS.flatMap(p => [
      `actuals_${p}_filename`,
      `actuals_${p}_beg_date`,
      `actuals_${p}_end_date`,
    ]),
  ];
  const settingsRes = await db.query("SELECT key, value FROM settings WHERE key = ANY($1)", [settingsKeys]);
  const settingsMap: Record<string, string> = {};
  for (const row of settingsRes.rows) settingsMap[row.key] = row.value;

  // Build per-period actuals metadata for the UI (reuse uploadedActualKeys from section 0)

  const actualsPeriods: Record<string, { filename: string | null; beg_date: string | null; end_date: string | null; has_file: boolean }> = {};
  for (const p of ACTUAL_PERIODS) {
    actualsPeriods[p] = {
      filename:  settingsMap[`actuals_${p}_filename`]  ?? null,
      beg_date:  settingsMap[`actuals_${p}_beg_date`]  ?? null,
      end_date:  settingsMap[`actuals_${p}_end_date`]  ?? null,
      has_file:  uploadedActualKeys.has(`actuals_${p}`),
    };
  }

  // Dates for current period (or range across all for ye_total)
  let asOfDate: string | null = null;
  let ytdBegDate: string | null = null;
  let ytdEndDate: string | null = null;

  if (period === "ye_total" || period === "ytd") {
    const uploaded = ACTUAL_PERIODS.filter(p => actualsPeriods[p].has_file);
    ytdBegDate = uploaded.length ? (uploaded.map(p => actualsPeriods[p].beg_date).filter(Boolean).sort()[0] ?? null) : null;
    ytdEndDate = uploaded.length ? (uploaded.map(p => actualsPeriods[p].end_date).filter(Boolean).sort().at(-1) ?? null) : null;
    asOfDate = ytdEndDate;
  } else {
    asOfDate   = settingsMap[`actuals_${period}_end_date`]   ?? null;
    ytdBegDate = settingsMap[`actuals_${period}_beg_date`]   ?? null;
    ytdEndDate = settingsMap[`actuals_${period}_end_date`]   ?? null;
  }

  // ── 3. Classification lookup ───────────────────────────────────────────────
  type Info = { class: string; subclass: string; detail: string; acct_desc: string };
  const classifyMap = new Map<string, Info>();
  for (const r of budgetRows) {
    if (!classifyMap.has(r.acct))
      classifyMap.set(r.acct, { class: r.class, subclass: r.subclass, detail: r.detail, acct_desc: r.acct_desc });
  }
  for (const r of actualRows) {
    if (!classifyMap.has(r.acct))
      classifyMap.set(r.acct, { class: r.class, subclass: "Other", detail: "", acct_desc: r.acct_desc });
  }

  // ── 4. Build hierarchy ─────────────────────────────────────────────────────
  const allAccts = new Set([
    ...Object.keys(combinedProjMap),
    ...Object.keys(projMap.PFP ?? {}),
    ...Object.keys(projMap.PGE ?? {}),
    ...Object.keys(projMap.LGC ?? {}),
    ...Object.keys(actualMap),
  ]);

  // class → subclass → detail → accounts
  type Hier = Map<string, Map<string, Map<string, AccountRow[]>>>;
  const hierMap: Hier = new Map();

  for (const acct of allAccts) {
    const info = classifyMap.get(acct);
    if (!info) continue;

    const combProj = combinedProjMap[acct] ?? 0;
    const pfpProj  = projMap.PFP?.[acct]  ?? 0;
    const pgeProj  = projMap.PGE?.[acct]  ?? 0;
    const lgcProj  = projMap.LGC?.[acct]  ?? 0;
    const act      = actualMap[acct];
    const combAct  = act?.combined ?? 0;
    const pfpAct   = act?.pfp      ?? 0;
    const pgeAct   = act?.pge      ?? 0;
    const lgcAct   = act?.lgc      ?? 0;

    if (!showZeros && [combProj,pfpProj,pgeProj,lgcProj,combAct,pfpAct,pgeAct,lgcAct].every(v => v === 0))
      continue;

    const row: AccountRow = {
      acct, acct_desc: info.acct_desc,
      combined: metrics(combProj, combAct),
      pfp:      metrics(pfpProj,  pfpAct),
      pge:      metrics(pgeProj,  pgeAct),
      lgc:      metrics(lgcProj,  lgcAct),
    };

    if (!hierMap.has(info.class)) hierMap.set(info.class, new Map());
    const subMap = hierMap.get(info.class)!;
    const sub = info.subclass || "Other";
    if (!subMap.has(sub)) subMap.set(sub, new Map());
    const detMap = subMap.get(sub)!;
    const det = info.detail || "";
    if (!detMap.has(det)) detMap.set(det, []);
    detMap.get(det)!.push(row);
  }

  // ── 5. Aggregate ──────────────────────────────────────────────────────────
  const classes: ClassRow[] = [];
  let netComb = zero(), netPfp = zero(), netPge = zero(), netLgc = zero();

  for (const cls of ["Income","Expenses"]) {
    const subMap = hierMap.get(cls);
    if (!subMap) continue;
    const subclasses: SubclassRow[] = [];
    let cComb = zero(), cPfp = zero(), cPge = zero(), cLgc = zero();

    for (const [subclass, detMap] of subMap) {
      const details: DetailRow[] = [];
      let sComb = zero(), sPfp = zero(), sPge = zero(), sLgc = zero();

      for (const [detail, accounts] of detMap) {
        let dComb = zero(), dPfp = zero(), dPge = zero(), dLgc = zero();
        for (const a of accounts) {
          dComb = add(dComb, a.combined); dPfp = add(dPfp, a.pfp);
          dPge  = add(dPge,  a.pge);     dLgc = add(dLgc, a.lgc);
        }
        sComb = add(sComb, dComb); sPfp = add(sPfp, dPfp);
        sPge  = add(sPge,  dPge);  sLgc = add(sLgc, dLgc);
        details.push({ detail, combined: dComb, pfp: dPfp, pge: dPge, lgc: dLgc, accounts });
      }
      cComb = add(cComb, sComb); cPfp = add(cPfp, sPfp);
      cPge  = add(cPge,  sPge);  cLgc = add(cLgc, sLgc);
      subclasses.push({ subclass, combined: sComb, pfp: sPfp, pge: sPge, lgc: sLgc, details });
    }

    subclasses.sort((a,b) => Math.abs(b.combined.projected) - Math.abs(a.combined.projected));
    classes.push({ class: cls, combined: cComb, pfp: cPfp, pge: cPge, lgc: cLgc, subclasses });
    const sign = cls === "Income" ? 1 : -1;
    netComb = add(netComb, { projected: sign*cComb.projected, actual: sign*cComb.actual, variance: sign*cComb.variance });
    netPfp  = add(netPfp,  { projected: sign*cPfp.projected,  actual: sign*cPfp.actual,  variance: sign*cPfp.variance  });
    netPge  = add(netPge,  { projected: sign*cPge.projected,  actual: sign*cPge.actual,  variance: sign*cPge.variance  });
    netLgc  = add(netLgc,  { projected: sign*cLgc.projected,  actual: sign*cLgc.actual,  variance: sign*cLgc.variance  });
  }

  // ── 6. Eliminations ────────────────────────────────────────────────────────
  const projElimRes = await db.query(`
    SELECT acct, acct_desc, class, SUM(${budgetColExpr})::float AS value
    FROM budget_entries WHERE int_ext='Internal'
    GROUP BY acct, acct_desc, class HAVING SUM(${budgetColExpr}) != 0
    ORDER BY class, acct
  `);
  const projElimMap = new Map(projElimRes.rows.map(r => [r.acct, r]));
  const actualElimMap = new Map(actualRows.filter(r => r.elim !== 0).map(r => [r.acct, r.elim]));

  const elimAccts = new Set([...projElimMap.keys(), ...actualElimMap.keys()]);
  const eliminations: EliminationRow[] = [];
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
  eliminations.sort((a,b) => a.class.localeCompare(b.class) || a.acct.localeCompare(b.acct));

  // ── 7. File availability ───────────────────────────────────────────────────
  const filesRes = await db.query("SELECT key FROM uploaded_files WHERE key = 'budget'");
  const hasBudgetFile = filesRes.rows.length > 0;
  const hasActualsFile = (period === "ye_total" || period === "ytd")
    ? ACTUAL_PERIODS.some(p => actualsPeriods[p].has_file)
    : (actualsPeriods[period as typeof ACTUAL_PERIODS[number]]?.has_file ?? false);

  return NextResponse.json({
    period, as_of_date: asOfDate, ytd_beg_date: ytdBegDate, ytd_end_date: ytdEndDate,
    has_actuals: hasActuals,
    has_budget_file: hasBudgetFile,
    has_actuals_file: hasActualsFile,
    budget_filename: settingsMap["budget_filename"] ?? null,
    actuals_filename: (period !== "ye_total" && period !== "ytd") ? (actualsPeriods[period as typeof ACTUAL_PERIODS[number]]?.filename ?? null) : null,
    actuals_periods: actualsPeriods,
    classes,
    net_income: { combined: netComb, pfp: netPfp, pge: netPge, lgc: netLgc },
    eliminations,
  } satisfies DashboardResponse);
}
