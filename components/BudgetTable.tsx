"use client";
import { useState } from "react";
import type {
  BudgetResponse,
  ClassRow,
  SubclassRow,
  DetailRow,
  AccountRow,
} from "@/app/api/budget/route";

function fmt(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (n < 0) return `($${s})`;
  if (n === 0) return "—";
  return `$${s}`;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 flex-shrink-0 ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

/* ── Account row (level 4, no expand) ── */
function AccountRowEl({ acct }: { acct: AccountRow }) {
  return (
    <tr className="hover:bg-slate-50/60 group">
      <td className="pl-24 pr-4 py-2 text-xs text-slate-500">
        <span className="font-mono text-slate-400 mr-2 text-[11px]">{acct.acct}</span>
        {acct.acct_desc}
      </td>
      <td className={`px-6 py-2 text-right text-xs font-medium tabular-nums ${acct.value < 0 ? "text-red-600" : "text-slate-600"}`}>
        {fmt(acct.value)}
      </td>
    </tr>
  );
}

/* ── Detail row (level 3, expands to accounts) ── */
function DetailRowEl({
  detail,
  depth,
}: {
  detail: DetailRow;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const hasAccounts = detail.accounts.length > 0;
  const paddingLeft = depth * 6 * 4; // 6 × 4px per depth

  return (
    <>
      <tr
        className={`hover:bg-slate-50 ${hasAccounts ? "cursor-pointer" : ""} group`}
        onClick={() => hasAccounts && setOpen((v) => !v)}
      >
        <td className="py-2 pr-4" style={{ paddingLeft: `${paddingLeft}px` }}>
          <div className="flex items-center gap-2">
            {hasAccounts && <ChevronIcon open={open} />}
            {!hasAccounts && <span className="w-3.5" />}
            <span className="text-xs text-slate-600">
              {detail.detail || <span className="italic text-slate-400">Uncategorized</span>}
            </span>
          </div>
        </td>
        <td className={`px-6 py-2 text-right text-xs font-semibold tabular-nums ${detail.value < 0 ? "text-red-600" : "text-slate-700"}`}>
          {fmt(detail.value)}
        </td>
      </tr>
      {open &&
        detail.accounts.map((a, i) => <AccountRowEl key={`${a.acct}-${i}`} acct={a} />)}
    </>
  );
}

/* ── Subclass row (level 2, expands to details) ── */
function SubclassRowEl({ sub }: { sub: SubclassRow }) {
  const [open, setOpen] = useState(false);
  const hasChildren = sub.details.length > 0;

  // If all details are unnamed (empty string), collapse to just accounts
  const hasNamedDetails = sub.details.some((d) => d.detail !== "");

  return (
    <>
      <tr
        className={`hover:bg-slate-50 ${hasChildren ? "cursor-pointer" : ""} group bg-slate-25`}
        onClick={() => hasChildren && setOpen((v) => !v)}
      >
        <td className="pl-10 pr-4 py-2.5">
          <div className="flex items-center gap-2">
            {hasChildren && <ChevronIcon open={open} />}
            {!hasChildren && <span className="w-3.5" />}
            <span className="text-sm text-slate-700">{sub.subclass}</span>
          </div>
        </td>
        <td className={`px-6 py-2.5 text-right text-sm font-semibold tabular-nums ${sub.value < 0 ? "text-red-600" : "text-slate-700"}`}>
          {fmt(sub.value)}
        </td>
      </tr>
      {open &&
        sub.details.map((d, i) =>
          hasNamedDetails ? (
            <DetailRowEl key={`${d.detail}-${i}`} detail={d} depth={4} />
          ) : (
            /* If detail names are blank, show accounts directly */
            d.accounts.map((a, j) => <AccountRowEl key={`${a.acct}-${j}`} acct={a} />)
          )
        )}
    </>
  );
}

/* ── Class row (level 1, expands to subclasses) ── */
function ClassRowEl({
  cls,
  isNetIncome,
}: {
  cls: ClassRow;
  isNetIncome?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = cls.subclasses.length > 0;

  if (isNetIncome) {
    return (
      <tr className="bg-slate-800">
        <td className="pl-6 pr-4 py-3.5">
          <span className="text-sm font-bold text-white">Net Income</span>
        </td>
        <td className={`px-6 py-3.5 text-right text-sm font-bold tabular-nums ${cls.value >= 0 ? "text-green-300" : "text-red-300"}`}>
          {fmt(cls.value)}
        </td>
      </tr>
    );
  }

  const isIncome = cls.class === "Income";

  return (
    <>
      <tr
        className={`${hasChildren ? "cursor-pointer" : ""} ${
          isIncome ? "bg-green-50 hover:bg-green-100/60" : "bg-red-50 hover:bg-red-100/60"
        }`}
        onClick={() => hasChildren && setOpen((v) => !v)}
      >
        <td className="pl-6 pr-4 py-3.5">
          <div className="flex items-center gap-2">
            {hasChildren && <ChevronIcon open={open} />}
            <span className="text-sm font-bold text-slate-800">{cls.class}</span>
            <span className="text-xs text-slate-400 ml-1">
              {cls.subclasses.length} {cls.subclasses.length === 1 ? "category" : "categories"}
            </span>
          </div>
        </td>
        <td className={`px-6 py-3.5 text-right text-sm font-bold tabular-nums ${cls.value < 0 ? "text-red-700" : "text-slate-800"}`}>
          {fmt(cls.value)}
        </td>
      </tr>
      {open && cls.subclasses.map((sub, i) => <SubclassRowEl key={`${sub.subclass}-${i}`} sub={sub} />)}
    </>
  );
}

/* ── Main table ── */
export default function BudgetTable({ data }: { data: BudgetResponse }) {
  const income = data.classes.find((c) => c.class === "Income");
  const expenses = data.classes.find((c) => c.class === "Expenses");
  const netIncome: ClassRow = {
    class: "Net Income",
    value: data.net_income,
    subclasses: [],
  };

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th className="pl-6 pr-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-full">
            Category
          </th>
          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
            Projected
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {income && <ClassRowEl cls={income} />}
        {expenses && <ClassRowEl cls={expenses} />}
        <ClassRowEl cls={netIncome} isNetIncome />
      </tbody>
    </table>
  );
}
