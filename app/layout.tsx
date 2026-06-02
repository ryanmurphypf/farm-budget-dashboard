import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget Dashboard — Peterson Farms",
  description: "FY2026 Budget — Projected vs Actual",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  );
}
