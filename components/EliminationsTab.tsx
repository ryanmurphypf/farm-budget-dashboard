"use client";
import type { DashboardResponse, EliminationRow } from "@/app/api/dashboard/route";
import { fmtDollar, varColor } from "@/lib/format";

export default function EliminationsTab({ data }: { data: DashboardResponse }) {
  const income = data.eliminations.filter(e => e.class === "Income");
  const expenses = data.eliminations.filter(e => e.class === "Expenses");

  function Table({ rows, title }: { rows: EliminationRow[]; title: string }) {
    const totalProj = rows.reduce((s, r) => s + r.projected, 0);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    return (
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Acct</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Projected Elim</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Actual Elim</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const variance = r.actual - r.projected;
              return (
                <tr key={i} className="hover:bg-blue-50">
                  <td className="px-4 py-2 text-xs font-mono text-slate-500">{r.acct}</td>
                  <td className="px-4 py-2 text-xs text-slate-700">{r.acct_desc}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-700 font-medium whitespace-nowrap">
                    {fmtDollar(r.projected)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-700 font-medium whitespace-nowrap">
                    {fmtDollar(r.actual)}
                  </td>
                  <td className={`px-4 py-2 text-right text-xs tabular-nums font-semibold whitespace-nowrap ${varColor(variance, r.class)}`}>
                    {variance === 0 ? "—" : fmtDollar(variance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-slate-700">Total {title} Eliminations</td>
              <td className="px-4 py-2.5 text-right text-xs font-bold tabular-nums text-slate-800 whitespace-nowrap">{fmtDollar(totalProj)}</td>
              <td className="px-4 py-2.5 text-right text-xs font-bold tabular-nums text-slate-800 whitespace-nowrap">{fmtDollar(totalActual)}</td>
              <td className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${varColor(totalActual - totalProj, title)}`}>
                {fmtDollar(totalActual - totalProj)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3 text-xs text-amber-800">
        These eliminations are <strong>excluded from all other tabs</strong>. They represent intercompany transactions between PFP, PGE and LGC that would otherwise be double-counted in the combined view.
      </div>
      {income.length > 0 && <Table rows={income} title="Income" />}
      {expenses.length > 0 && <Table rows={expenses} title="Expenses" />}
      {income.length === 0 && expenses.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">No elimination data yet. Upload both a budget and actuals file.</p>
      )}
    </div>
  );
}
