"use client";
import { useState } from "react";
import type { DashboardResponse, ClassRow, SubclassRow, DetailRow, AccountRow, EntityMetrics } from "@/app/api/dashboard/route";
import { fmtDollar, varColor } from "@/lib/format";

type EntityKey = "combined" | "pfp" | "pge" | "lgc";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 flex-shrink-0 ${open ? "rotate-90" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function MetricCells({ m, cls, hasActuals }: { m: EntityMetrics; cls: string; hasActuals: boolean }) {
  return (
    <>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700 font-medium whitespace-nowrap">
        {fmtDollar(m.projected)}
      </td>
      {hasActuals && (
        <>
          <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700 font-medium whitespace-nowrap">
            {fmtDollar(m.actual)}
          </td>
          <td className={`px-3 py-2 text-right text-xs tabular-nums font-semibold whitespace-nowrap ${varColor(m.variance, cls)}`}>
            {m.variance === 0 ? "—" : fmtDollar(m.variance)}
          </td>
        </>
      )}
    </>
  );
}

function AccountRowEl({ acct, entity, cls, hasActuals }: { acct: AccountRow; entity: EntityKey; cls: string; hasActuals: boolean }) {
  const m = acct[entity];
  return (
    <tr className="hover:bg-blue-50/70">
      <td className="pl-20 pr-4 py-1.5 text-xs text-slate-500">
        <span className="font-mono text-slate-400 mr-2 text-[11px]">{acct.acct}</span>
        {acct.acct_desc}
      </td>
      <MetricCells m={m} cls={cls} hasActuals={hasActuals} />
    </tr>
  );
}

function DetailRowEl({ detail, entity, cls, depth, hasActuals }: { detail: DetailRow; entity: EntityKey; cls: string; depth: number; hasActuals: boolean }) {
  const [open, setOpen] = useState(false);
  const m = detail[entity];
  const pl = depth * 24;
  return (
    <>
      <tr className="hover:bg-blue-50 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <td className="py-2 pr-4" style={{ paddingLeft: `${pl}px` }}>
          <div className="flex items-center gap-2">
            <ChevronIcon open={open} />
            <span className="text-xs text-slate-600">{detail.detail || <span className="italic text-slate-400">Uncategorized</span>}</span>
          </div>
        </td>
        <MetricCells m={m} cls={cls} hasActuals={hasActuals} />
      </tr>
      {open && detail.accounts.map((a, i) => (
        <AccountRowEl key={`${a.acct}-${i}`} acct={a} entity={entity} cls={cls} hasActuals={hasActuals} />
      ))}
    </>
  );
}

function SubclassRowEl({ sub, entity, cls, hasActuals }: { sub: SubclassRow; entity: EntityKey; cls: string; hasActuals: boolean }) {
  const [open, setOpen] = useState(false);
  const m = sub[entity];
  const hasNamedDetails = sub.details.some(d => d.detail !== "");
  return (
    <>
      <tr className="hover:bg-blue-50 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <td className="pl-10 pr-4 py-2.5">
          <div className="flex items-center gap-2">
            <ChevronIcon open={open} />
            <span className="text-sm text-slate-700">{sub.subclass}</span>
          </div>
        </td>
        <MetricCells m={m} cls={cls} hasActuals={hasActuals} />
      </tr>
      {open && sub.details.map((d, i) =>
        hasNamedDetails
          ? <DetailRowEl key={`${d.detail}-${i}`} detail={d} entity={entity} cls={cls} depth={4} hasActuals={hasActuals} />
          : d.accounts.map((a, j) => <AccountRowEl key={`${a.acct}-${j}`} acct={a} entity={entity} cls={cls} hasActuals={hasActuals} />)
      )}
    </>
  );
}

function ClassRowEl({ cls, entity, isNet, hasActuals }: { cls: ClassRow; entity: EntityKey; isNet?: boolean; hasActuals: boolean }) {
  const [open, setOpen] = useState(false);
  const m = cls[entity];
  if (isNet) {
    return (
      <tr className="bg-slate-800">
        <td className="pl-6 pr-4 py-3.5"><span className="text-sm font-bold text-white">Net Income</span></td>
        <td className={`px-3 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap ${m.projected >= 0 ? "text-green-300" : "text-red-300"}`}>
          {fmtDollar(m.projected)}
        </td>
        {hasActuals && (
          <>
            <td className={`px-3 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap ${m.actual >= 0 ? "text-green-300" : "text-red-300"}`}>
              {fmtDollar(m.actual)}
            </td>
            <td className={`px-3 py-3.5 text-right text-sm font-bold tabular-nums whitespace-nowrap ${m.variance >= 0 ? "text-green-300" : "text-red-300"}`}>
              {m.variance === 0 ? "—" : fmtDollar(m.variance)}
            </td>
          </>
        )}
      </tr>
    );
  }
  const isIncome = cls.class === "Income";
  return (
    <>
      <tr className={`cursor-pointer ${isIncome ? "bg-green-50 hover:bg-blue-100/70" : "bg-red-50 hover:bg-blue-100/70"}`}
        onClick={() => setOpen(v => !v)}>
        <td className="pl-6 pr-4 py-3.5">
          <div className="flex items-center gap-2">
            <ChevronIcon open={open} />
            <span className="text-sm font-bold text-slate-800">{cls.class}</span>
            <span className="text-xs text-slate-400">{cls.subclasses.length} {cls.subclasses.length === 1 ? "category" : "categories"}</span>
          </div>
        </td>
        <MetricCells m={m} cls={cls.class} hasActuals={hasActuals} />
      </tr>
      {open && cls.subclasses.map((sub, i) => (
        <SubclassRowEl key={`${sub.subclass}-${i}`} sub={sub} entity={entity} cls={cls.class} hasActuals={hasActuals} />
      ))}
    </>
  );
}

export default function EntityTable({ data, entity, hasActuals }: { data: DashboardResponse; entity: EntityKey; hasActuals: boolean }) {
  const netRow: ClassRow = {
    class: "Net Income", subclasses: [],
    combined: data.net_income.combined,
    pfp: data.net_income.pfp,
    pge: data.net_income.pge,
    lgc: data.net_income.lgc,
  };

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th className="pl-6 pr-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-full">Category</th>
          <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Projected</th>
          {hasActuals && (
            <>
              <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Actual</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Variance</th>
            </>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {data.classes.map((cls, i) => (
          <ClassRowEl key={i} cls={cls} entity={entity} hasActuals={hasActuals} />
        ))}
        <ClassRowEl cls={netRow} entity={entity} isNet hasActuals={hasActuals} />
      </tbody>
    </table>
  );
}
