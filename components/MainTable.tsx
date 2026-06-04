"use client";
import { useState } from "react";
import type { DashboardResponse, ClassRow, SubclassRow, DetailRow, AccountRow, EntityMetrics } from "@/app/api/dashboard/route";
import { fmtDollar, varColor } from "@/lib/format";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function V({ m, cls }: { m: EntityMetrics; cls: string }) {
  return (
    <>
      <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-600 whitespace-nowrap font-medium">{fmtDollar(m.projected)}</td>
      <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-600 whitespace-nowrap font-medium">{fmtDollar(m.actual)}</td>
      <td className={`px-2 py-2 text-right text-xs tabular-nums font-semibold whitespace-nowrap ${varColor(m.variance, cls)}`}>
        {m.variance === 0 ? "—" : fmtDollar(m.variance)}
      </td>
    </>
  );
}

function AccountRow12({ a, cls }: { a: AccountRow; cls: string }) {
  return (
    <tr className="hover:bg-blue-50/70">
      <td className="pl-16 pr-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">
        <span className="font-mono text-slate-400 mr-1.5 text-[11px]">{a.acct}</span>{a.acct_desc}
      </td>
      <V m={a.combined} cls={cls} />
      <V m={a.pfp} cls={cls} />
      <V m={a.pge} cls={cls} />
      <V m={a.lgc} cls={cls} />
    </tr>
  );
}

function DetailRow12({ d, cls }: { d: DetailRow; cls: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-blue-50 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <td className="pl-12 pr-3 py-2">
          <div className="flex items-center gap-2">
            <ChevronIcon open={open} />
            <span className="text-xs text-slate-600">{d.detail || <span className="italic text-slate-400">Uncategorized</span>}</span>
          </div>
        </td>
        <V m={d.combined} cls={cls} /><V m={d.pfp} cls={cls} /><V m={d.pge} cls={cls} /><V m={d.lgc} cls={cls} />
      </tr>
      {open && d.accounts.map((a, i) => <AccountRow12 key={`${a.acct}-${i}`} a={a} cls={cls} />)}
    </>
  );
}

function SubclassRow12({ sub, cls }: { sub: SubclassRow; cls: string }) {
  const [open, setOpen] = useState(false);
  const hasNamedDetails = sub.details.some(d => d.detail !== "");
  return (
    <>
      <tr className="hover:bg-blue-50 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <td className="pl-8 pr-3 py-2.5">
          <div className="flex items-center gap-2">
            <ChevronIcon open={open} />
            <span className="text-sm text-slate-700">{sub.subclass}</span>
          </div>
        </td>
        <V m={sub.combined} cls={cls} /><V m={sub.pfp} cls={cls} /><V m={sub.pge} cls={cls} /><V m={sub.lgc} cls={cls} />
      </tr>
      {open && sub.details.map((d, i) =>
        hasNamedDetails
          ? <DetailRow12 key={`${d.detail}-${i}`} d={d} cls={cls} />
          : d.accounts.map((a, j) => <AccountRow12 key={`${a.acct}-${j}`} a={a} cls={cls} />)
      )}
    </>
  );
}

function ClassRow12({ cls, isNet }: { cls: ClassRow; isNet?: boolean }) {
  const [open, setOpen] = useState(false);
  if (isNet) {
    const m = cls.combined;
    return (
      <tr className="bg-slate-800">
        <td className="pl-5 pr-3 py-3"><span className="text-sm font-bold text-white">Net Income</span></td>
        {(["combined", "pfp", "pge", "lgc"] as const).map(e => {
          const em = cls[e];
          return (
            <><td key={`${e}p`} className={`px-2 py-3 text-right text-xs font-bold tabular-nums whitespace-nowrap ${em.projected >= 0 ? "text-green-300" : "text-red-300"}`}>{fmtDollar(em.projected)}</td>
            <td key={`${e}a`} className={`px-2 py-3 text-right text-xs font-bold tabular-nums whitespace-nowrap ${em.actual >= 0 ? "text-green-300" : "text-red-300"}`}>{fmtDollar(em.actual)}</td>
            <td key={`${e}v`} className={`px-2 py-3 text-right text-xs font-bold tabular-nums whitespace-nowrap ${em.variance >= 0 ? "text-green-300" : "text-red-300"}`}>{em.variance === 0 ? "—" : fmtDollar(em.variance)}</td></>
          );
        })}
      </tr>
    );
  }
  const isIncome = cls.class === "Income";
  return (
    <>
      <tr className={`cursor-pointer ${isIncome ? "bg-green-50 hover:bg-blue-100/70" : "bg-red-50 hover:bg-blue-100/70"}`}
        onClick={() => setOpen(v => !v)}>
        <td className="pl-5 pr-3 py-3">
          <div className="flex items-center gap-2">
            <ChevronIcon open={open} />
            <span className="text-sm font-bold text-slate-800">{cls.class}</span>
          </div>
        </td>
        <V m={cls.combined} cls={cls.class} /><V m={cls.pfp} cls={cls.class} /><V m={cls.pge} cls={cls.class} /><V m={cls.lgc} cls={cls.class} />
      </tr>
      {open && cls.subclasses.map((sub, i) => <SubclassRow12 key={`${sub.subclass}-${i}`} sub={sub} cls={cls.class} />)}
    </>
  );
}

export default function MainTable({ data }: { data: DashboardResponse }) {
  const netRow: ClassRow = {
    class: "Net Income", subclasses: [],
    combined: data.net_income.combined,
    pfp: data.net_income.pfp,
    pge: data.net_income.pge,
    lgc: data.net_income.lgc,
  };

  const groups = [
    { label: "Combined", span: 3, color: "bg-slate-700" },
    { label: "PFP", span: 3, color: "bg-green-800" },
    { label: "PGE", span: 3, color: "bg-blue-800" },
    { label: "LGC", span: 3, color: "bg-amber-700" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm" style={{ minWidth: "1400px" }}>
        <thead>
          <tr>
            <th className="pl-5 pr-3 py-2 text-left" rowSpan={2} />
            {groups.map(g => (
              <th key={g.label} colSpan={g.span} className={`px-2 py-2 text-center text-xs font-bold text-white uppercase tracking-wide ${g.color}`}>
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="border-b border-slate-200">
            {groups.map(g => (
              <>
                <th key={`${g.label}-p`} className="px-2 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Proj</th>
                <th key={`${g.label}-a`} className="px-2 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Actual</th>
                <th key={`${g.label}-v`} className="px-2 py-2 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Var</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.classes.map((cls, i) => <ClassRow12 key={i} cls={cls} />)}
          <ClassRow12 cls={netRow} isNet />
        </tbody>
      </table>
    </div>
  );
}
