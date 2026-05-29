"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { BudgetResponse } from "@/app/api/budget/route";
import { PERIODS, ENTITIES } from "@/lib/constants";
import type { PeriodKey, EntityKey } from "@/lib/constants";
import BudgetTable from "./BudgetTable";
import SummaryCards from "./SummaryCards";
import ClassBarChart from "./ClassBarChart";

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; count: number; filename: string }
  | { status: "error"; message: string };

export default function DashboardClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entity, setEntity] = useState<EntityKey>("Combined");
  const [period, setPeriod] = useState<PeriodKey>("ye_total");
  const [showZeros, setShowZeros] = useState(false);
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/budget?entity=${entity}&period=${period}&showZeros=${showZeros}`
      );
      if (res.status === 401) { router.push("/login"); return; }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [entity, period, showZeros, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadState({ status: "uploading" });

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/budget/upload", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setUploadState({ status: "error", message: json.error ?? "Upload failed" });
      } else {
        setUploadState({ status: "success", count: json.count, filename: json.filename });
        // Refresh dashboard data with new budget
        await fetchData();
        // Auto-clear success message after 6s
        setTimeout(() => setUploadState({ status: "idle" }), 6000);
      }
    } catch {
      setUploadState({ status: "error", message: "Network error — please try again" });
    } finally {
      // Reset file input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;
  const isUploading = uploadState.status === "uploading";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="shrink-0">
            <h1 className="text-xl font-bold text-slate-800 leading-tight">Peterson Farms</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              FY2026 Budget &mdash; Feb 1, 2026 &ndash; Jan 31, 2027
            </p>
          </div>

          {/* Upload Budget */}
          <div className="flex items-center gap-3">
            {/* Status message */}
            {uploadState.status === "success" && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Budget updated — {uploadState.count.toLocaleString()} rows from{" "}
                <span className="font-medium">{uploadState.filename}</span>
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

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Upload trigger button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                isUploading
                  ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
              }`}
            >
              {isUploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Update Budget
                </>
              )}
            </button>

            <div className="w-px h-5 bg-slate-200" />

            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Entity Filter */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {ENTITIES.map((e) => (
              <button
                key={e}
                onClick={() => setEntity(e)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  entity === e
                    ? "bg-green-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  period === p.key
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.short}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        {data && (
          <SummaryCards data={data} periodLabel={periodLabel} entity={entity} />
        )}

        {/* Bar Chart */}
        {data && <ClassBarChart data={data} periodLabel={periodLabel} />}

        {/* Budget Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">
                Budget Detail &mdash; {entity} &mdash; {periodLabel}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any row to expand. 4 levels: Class → Subclass → Detail → Account
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-slate-500">Show $0 accounts</span>
              <div
                onClick={() => setShowZeros((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  showZeros ? "bg-green-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    showZeros ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
              Loading…
            </div>
          ) : data ? (
            <BudgetTable data={data} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
