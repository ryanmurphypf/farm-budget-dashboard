"use client";
import type { BudgetResponse } from "@/app/api/budget/route";

function fmt(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

type Props = { data: BudgetResponse; periodLabel: string; entity: string };

export default function SummaryCards({ data, periodLabel, entity }: Props) {
  const income = data.classes.find((c) => c.class === "Income")?.value ?? 0;
  const expenses = data.classes.find((c) => c.class === "Expenses")?.value ?? 0;
  const net = data.net_income;
  const margin = income !== 0 ? (net / income) * 100 : 0;

  const cards = [
    {
      label: "Total Income",
      value: income,
      color: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-200",
      icon: (
        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      label: "Total Expenses",
      value: expenses,
      color: "text-red-700",
      bg: "bg-red-50",
      border: "border-red-200",
      icon: (
        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17H5m0 0V9m0 8l8-8 4 4 6-6" />
        </svg>
      ),
    },
    {
      label: "Net Income",
      value: net,
      color: net >= 0 ? "text-slate-800" : "text-red-700",
      bg: net >= 0 ? "bg-slate-50" : "bg-red-50",
      border: net >= 0 ? "border-slate-200" : "border-red-200",
      sub: income !== 0 ? `${margin.toFixed(1)}% margin` : undefined,
      icon: (
        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        {entity} &mdash; {periodLabel} &mdash; Projected
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border ${c.border} ${c.bg} px-6 py-5 flex items-start gap-4`}
          >
            <div className="mt-0.5">{c.icon}</div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{fmt(c.value)}</p>
              {c.sub && <p className="text-xs text-slate-400 mt-1">{c.sub}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
