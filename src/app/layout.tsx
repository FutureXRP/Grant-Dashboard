import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grant Copilot — SquareOne Compassion",
  description: "Lean grant pipeline, writing workspace, and AI copilot",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/scout", label: "Grant Scout" },
  { href: "/discover", label: "Discover (Grants.gov)" },
  { href: "/funders", label: "Funders" },
  { href: "/library", label: "Library" },
  { href: "/readiness", label: "Readiness" },
  { href: "/profile", label: "Org Profile" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <aside className="no-print w-56 shrink-0 bg-emerald-950 text-emerald-50 flex flex-col">
            <div className="px-4 py-5 border-b border-emerald-900">
              <div className="text-lg font-bold leading-tight">Grant Copilot</div>
              <div className="text-xs text-emerald-300">SquareOne Compassion</div>
            </div>
            <nav className="flex-1 px-2 py-3 space-y-0.5">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="block rounded px-3 py-2 text-sm hover:bg-emerald-900"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="px-4 py-3 border-t border-emerald-900">
              <Link href="/opportunities/new" className="btn w-full justify-center">
                + New Opportunity
              </Link>
            </div>
          </aside>
          <main className="flex-1 p-6 max-w-6xl">{children}</main>
        </div>
      </body>
    </html>
  );
}
