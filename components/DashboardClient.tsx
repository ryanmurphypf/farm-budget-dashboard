"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { BudgetResponse } from "@/app/api/budget/route";
import { PERIODS, ENTITIES } from "@/lib/constants";
import type { PeriodKey, EntityKey } from "@/lib/constants";
import BudgetTable from "./BudgetTable";
import SummaryCards from "./SummaryCards";
import ClassBarChart from "./ClassBarChart";

export default function DashboardClient() {
  const router = useRouter();
  const [entity, setEntity] = useState<EntityKey>("Combined");
  const [period, setPeriod] = useState<PeriodKey>("ye_total");
  const [showZeros, setShowZeros] = useState(false);
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">Peterson Farms</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              FY2026 Budget &mdash; Feb 1, 2026 &ndash; Jan 31, 2027
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Sign out
          </button>
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
