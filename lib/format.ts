export function fmtDollar(n: number): string {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `($${s})` : `$${s}`;
}

export function fmtShort(n: number): string {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Variance color: for Income positive=green, negative=red.
 *  For Expenses sign is flipped (negative variance = favorable). */
export function varColor(variance: number, cls: "Income" | "Expenses" | string): string {
  if (variance === 0) return "text-slate-400";
  if (cls === "Expenses") {
    return variance < 0 ? "text-green-600" : "text-red-600";
  }
  return variance > 0 ? "text-green-600" : "text-red-600";
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
