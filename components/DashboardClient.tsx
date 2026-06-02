"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DashboardResponse } from "@/app/api/dashboard/route";
import { PERIODS } from "@/lib/constants";
import type { PeriodKey } from "@/lib/constants";
import MainTable from "./MainTable";
import EntityTable from "./EntityTable";
import EliminationsTab from "./EliminationsTab";
import { fmtShort, fmtDate } from "@/lib/format";

type TabKey = "main" | "combined" | "pfp" | "pge" | "lgc" | "eliminations";

const TABS: { key: TabKey; label: string }[] = [
  { key: "main", label: "Main" },
  { key: "combined", label: "Combined" },
  { key: "pfp", label: "PFP" },
  { key: "pge", label: "PGE" },
  { key: "lgc", label: "LGC" },
  { key: "eliminations", label: "Eliminations" },
];

type UploadState = { status: "idle" } | { status: "uploading"; label: string } | { status: "success"; msg: string } | { status: "error"; message: string };

export default function DashboardClient() {
  const router = useRouter();
  const budgetFileRef = useRef<HTMLInputElement>(null);
  const actualsFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabKey>("main");
  const [period, setPeriod] = useState<PeriodKey>("ye_total");
  const [showZeros, setShowZeros] = useState(false);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?period=${period}&showZeros=${showZeros}`);
      if (res.status === 401) { router.push("/login"); return; }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [period, showZeros, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleUpload(file: File, endpoint: string, label: string) {
    setUploadState({ status: "uploading", label });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(endpoint, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setUploadState({ status: "error", message: json.error ?? "Upload failed" });
      } else {
        const msg = endpoint.includes("actuals")
          ? `Actuals updated — ${json.count} rows, as of ${fmtDate(json.as_of_date)}`
          : `Budget updated — ${json.count} rows from ${json.filename}`;
        setUploadState({ status: "success", msg });
        await fetchData();
        setTimeout(() => setUploadState({ status: "idle" }), 7000);
      }
    } catch {
      setUploadState({ status: "error", message: "Network error — please try again" });
    } finally {
      if (budgetFileRef.current) budgetFileRef.current.value = "";
      if (actualsFileRef.current) actualsFileRef.current.value = "";
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? period;
  const isUploading = uploadState.status === "uploading";

  // Summary helpers
  const income = data?.classes.find(c => c.class === "Income");
  const expenses = data?.classes.find(c => c.class === "Expenses");
  const net = data?.net_income;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="shrink-0">
            <h1 className="text-xl font-bold text-slate-800 leading-tight">Peterson Farms</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              FY2026 Budget &mdash; Feb 1, 2026 &ndash; Jan 31, 2027
              {data?.as_of_date && (
                <span className="ml-2 text-blue-600 font-medium">· Actuals YTD through {fmtDate(data.as_of_date)}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Status message */}
            {uploadState.status === "success" && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {uploadState.msg}
              </span>
            )}
            {uploadState.status === "error" && (
              <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 max-w-xs">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {uploadState.message}
                <button onClick={() => setUploadState({ status: "idle" })} className="ml-1 hover:text-red-900">✕</button>
              </span>
            )}

            {/* Hidden file inputs */}
            <input ref={budgetFileRef} type="file" accept=".xlsx,.xlsm" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, "/api/budget/upload", "Budget"); }} />
            <input ref={actualsFileRef} type="file" accept=".xlsx,.xlsm" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, "/api/actuals/upload", "Actuals"); }} />

            {/* Upload buttons */}
            {(["Update Budget", "Update Actuals"] as const).map((label, idx) => {
              const ref = idx === 0 ? budgetFileRef : actualsFileRef;
              const isThis = isUploading && uploadState.status === "uploading" && uploadState.label === (idx === 0 ? "Budget" : "Actuals");
              return (
                <button key={label} onClick={() => ref.current?.click()} disabled={isUploading}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-all ${
                    isThis ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
                  }`}>
                  {isThis
                    ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading…</>
                    : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>{label}</>
                  }
                </button>
              );
            })}

            <div className="w-px h-5 bg-slate-200" />
            <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">
        {/* Summary Cards */}
        {data && net && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: "Combined Income",
                projected: income?.combined.projected ?? 0,
                actual: income?.combined.actual ?? 0,
                variance: income?.combined.variance ?? 0,
                cls: "Income",
                color: "green",
              },
              {
                label: "Combined Expenses",
                projected: expenses?.combined.projected ?? 0,
                actual: expenses?.combined.actual ?? 0,
                variance: expenses?.combined.variance ?? 0,
                cls: "Expenses",
                color: "red",
              },
              {
                label: "Net Income",
                projected: net.combined.projected,
                actual: net.combined.actual,
                variance: net.combined.variance,
                cls: "Income",
                color: net.combined.projected >= 0 ? "slate" : "red",
              },
              {
                label: "Net Margin (Proj)",
                projected: income?.combined.projected ? (net.combined.projected / income.combined.projected * 100) : 0,
                actual: (data.has_actuals && income?.combined.actual) ? (net.combined.actual / income.combined.actual * 100) : null,
                variance: null,
                cls: "pct",
                color: "slate",
              },
            ].map((card, i) => {
              const isPct = card.cls === "pct";
              const hasAct = data.has_actuals && !isPct;
              const borderCls = card.color === "green" ? "border-green-200" : card.color === "red" ? "border-red-200" : "border-slate-200";
              const heroColor = card.color === "green" ? "text-green-700" : card.color === "red" ? "text-red-700" : "text-slate-800";
              const varCls = card.variance != null
                ? card.cls === "Expenses"
                  ? (card.variance < 0 ? "text-green-600" : "text-red-600")
                  : (card.variance > 0 ? "text-green-600" : "text-red-600")
                : "";
              return (
                <div key={i} className={`bg-white rounded-xl border ${borderCls} px-5 py-4`}>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{card.label}</p>

                  {/* Actual — hero number (when actuals exist) */}
                  {hasAct ? (
                    <>
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Actual</p>
                      <p className={`text-2xl font-bold leading-tight ${heroColor}`}>
                        {fmtShort(card.actual ?? 0)}
                      </p>
                      {/* Projected — secondary */}
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Proj: <span className="text-slate-600 font-semibold text-sm">{fmtShort(card.projected)}</span></span>
                        {card.variance != null && card.variance !== 0 && (
                          <span className={`text-xs font-semibold ${varCls}`}>{fmtShort(card.variance)}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    /* No actuals yet — projected is the only number */
                    <>
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Projected</p>
                      <p className={`text-2xl font-bold leading-tight ${heroColor}`}>
                        {isPct
                          ? `${(card.projected as number).toFixed(1)}%`
                          : fmtShort(card.projected as number)}
                      </p>
                      {isPct && card.actual != null && (
                        <p className="text-xs text-slate-400 mt-1">Actual: <span className="text-slate-600 font-semibold">{(card.actual as number).toFixed(1)}%</span></p>
                      )}
                    </>
                  )}

                  {/* Pct card with actuals */}
                  {isPct && data.has_actuals && (
                    <>
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Actual Margin</p>
                      <p className={`text-2xl font-bold leading-tight ${(card.actual ?? 0) >= 0 ? "text-slate-800" : "text-red-700"}`}>
                        {card.actual != null ? `${(card.actual as number).toFixed(1)}%` : "—"}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400">Proj margin: <span className="text-slate-600 font-semibold text-sm">{(card.projected as number).toFixed(1)}%</span></span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tabs + Period selector row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  tab === t.key ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {tab !== "eliminations" && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => setPeriod(p.key)}
                    className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                      period === p.key ? "bg-green-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                    }`}>
                    {p.short}
                  </button>
                ))}
              </div>
            )}
            {tab !== "eliminations" && tab !== "main" && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-slate-500">Show $0</span>
                <div onClick={() => setShowZeros(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showZeros ? "bg-green-600" : "bg-slate-200"}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showZeros ? "translate-x-4.5" : "translate-x-0.5"}`} />
                </div>
              </label>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Tab header */}
          {tab !== "eliminations" && (
            <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">
                  {tab === "main" ? "All Entities" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {" "}&mdash; {periodLabel}
                  {tab === "main" && " (12-column view)"}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Click rows to expand · 4 levels: Class → Subclass → Detail → Account</p>
              </div>
              {!data?.has_actuals && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                  Upload actuals to see Actual & Variance columns
                </span>
              )}
            </div>
          )}
          {tab === "eliminations" && (
            <div className="px-6 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Intercompany Eliminations</h2>
              <p className="text-xs text-slate-400 mt-0.5">Excluded from all entity and combined views to prevent double-counting</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading…</div>
          ) : data ? (
            <div className={tab === "main" ? "" : "overflow-x-auto"}>
              {tab === "main" && <MainTable data={data} />}
              {tab === "combined" && <EntityTable data={data} entity="combined" hasActuals={data.has_actuals} />}
              {tab === "pfp" && <EntityTable data={data} entity="pfp" hasActuals={data.has_actuals} />}
              {tab === "pge" && <EntityTable data={data} entity="pge" hasActuals={data.has_actuals} />}
              {tab === "lgc" && <EntityTable data={data} entity="lgc" hasActuals={data.has_actuals} />}
              {tab === "eliminations" && <div className="p-6"><EliminationsTab data={data} /></div>}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
