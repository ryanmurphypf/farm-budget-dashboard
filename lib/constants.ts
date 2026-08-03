export const PERIODS = [
  { key: "ye_total", label: "Full Year",     short: "FY"  },
  { key: "ytd",     label: "Year-to-Date",   short: "YTD" },
  { key: "q1",      label: "Q1 (Feb–Apr)",   short: "Q1"  },
  { key: "q2",      label: "Q2 (May–Jul)",   short: "Q2"  },
  { key: "q3",      label: "Q3 (Aug–Oct)",   short: "Q3"  },
  { key: "q4",      label: "Q4 (Nov–Jan)",   short: "Q4"  },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export const ENTITIES = ["Combined", "PFP", "PGE", "LGC"] as const;
export type EntityKey = (typeof ENTITIES)[number];
