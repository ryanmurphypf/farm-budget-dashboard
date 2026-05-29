"use client";
import { useState } from "react";
import type { BudgetResponse, SubclassRow } from "@/app/api/budget/route";

function fmtK(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

type Props = { data: BudgetResponse; periodLabel: string };

export default function ClassBarChart({ data, periodLabel }: Props) {
  const [drillClass, setDrillClass] = useState<string | null>(null);

  const income = data.classes.find((c) => c.class === "Income");
  const expenses = data.classes.find((c) => c.class === "Expenses");

  // Class-level bars
  const classItems = [
    { label: "Income", value: income?.value ?? 0, color: "bg-green-500" },
    { label: "Expenses", value: expenses?.value ?? 0, color: "bg-red-400" },
  ];
  const classMax = Math.max(...classItems.map((i) => Math.abs(i.value)), 1);

  // Subclass drill-down
  const drillData = drillClass
    ? data.classes.find((c) => c.class === drillClass)?.subclasses ?? []
    : [];
  const drillMax = Math.max(...drillData.map((s: SubclassRow) => Math.abs(s.value)), 1);
  const drillColor = drillClass === "Income" ? "bg-green-500" : "bg-red-400";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">
            {drillClass ? `${drillClass} — Subclass Breakdown` : "Class Overview"}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{periodLabel} &mdash; Projected</p>
        </div>
        {drillClass && (
          <button
            onClick={() => setDrillClass(null)}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            ← Back to overview
          </button>
        )}
      </div>

      {!drillClass ? (
        /* Class overview */
        <div className="space-y-4">
          {classItems.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <button
                  onClick={() => setDrillClass(item.label)}
                  className="text-sm font-medium text-slate-700 hover:text-green-700 transition-colors"
                >
                  {item.label} <span className="text-xs text-slate-400 ml-1">→ drill down</span>
                </button>
                <span className="text-sm font-semibold text-slate-800">{fmtK(item.value)}</span>
              </div>
              <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full ${item.color} rounded-lg transition-all duration-500`}
                  style={{ width: `${(Math.abs(item.value) / classMax) * 100}%` }}
                />
              </div>
            </div>
          ))}

          {/* Net income indicator */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Net Income</span>
              <span
                className={`text-sm font-bold ${
                  data.net_income >= 0 ? "text-green-700" : "text-red-600"
                }`}
              >
                {data.net_income < 0 ? "-" : "+"}
                {fmtK(data.net_income)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Subclass drill-down */
        <div className="space-y-3">
          {drillData.length === 0 ? (
            <p className="text-sm text-slate-400">No data</p>
          ) : (
            drillData.map((sub: SubclassRow) => (
              <div key={sub.subclass}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-700">{sub.subclass}</span>
                  <span className="text-sm font-semibold text-slate-800">{fmtK(sub.value)}</span>
                </div>
                <div className="h-6 bg-slate-100 rounded-md overflow-hidden">
                  <div
                    className={`h-full ${drillColor} opacity-80 rounded-md transition-all duration-500`}
                    style={{ width: `${(Math.abs(sub.value) / drillMax) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
