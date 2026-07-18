import Link from "next/link";
import { db } from "@/lib/db";
import { STAGES, stageByKey, fmtMoney, daysUntil, deadlineColor } from "@/lib/stages";

export const dynamic = "force-dynamic";

type Opp = {
  id: number; name: string; funder_name: string; type: string; stage: string;
  amount: number; deadline: string; report_due: string; renewal: number; awarded_amount: number;
};

export default function Dashboard() {
  const d = db();
  const opps = d.prepare(`SELECT * FROM opportunities ORDER BY deadline = '', deadline`).all() as Opp[];

  const active = opps.filter((o) => stageByKey(o.stage).preAward);
  const awarded = opps.filter((o) => o.stage === "awarded" || o.stage === "reporting");
  const submitted = opps.filter((o) => ["submitted", "under_review", "pending_award"].includes(o.stage));
  const pipelineValue = active.reduce((s, o) => s + (o.amount || 0), 0);
  const weighted = active.reduce((s, o) => s + (o.amount || 0) * stageByKey(o.stage).p, 0);
  const awardedTotal = awarded.reduce((s, o) => s + (o.awarded_amount || o.amount || 0), 0);

  const upcoming = opps
    .filter((o) => o.deadline && stageByKey(o.stage).preAward)
    .map((o) => ({ ...o, days: daysUntil(o.deadline) }))
    .filter((o) => o.days !== null && o.days >= -7)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 8);

  const reportsDue = opps
    .filter((o) => o.report_due)
    .map((o) => ({ ...o, days: daysUntil(o.report_due) }))
    .filter((o) => o.days !== null && o.days >= -7)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 5);

  const renewals = opps.filter((o) => o.renewal === 1);

  const readiness = d.prepare(`SELECT status, COUNT(*) n FROM readiness GROUP BY status`).all() as { status: string; n: number }[];
  const readyCount = readiness.find((r) => r.status === "ready")?.n ?? 0;
  const readyTotal = readiness.reduce((s, r) => s + r.n, 0);

  const funnel = STAGES.filter((s) => s.key !== "closed").map((s) => ({
    ...s,
    count: opps.filter((o) => o.stage === s.key).length,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/opportunities/new" className="btn">+ New Opportunity</Link>
      </div>

      {readyTotal > 0 && readyCount < readyTotal && (
        <Link href="/readiness" className="card block p-4 border-amber-300 bg-amber-50 hover:bg-amber-100">
          <span className="font-semibold text-amber-900">
            Grant readiness: {readyCount}/{readyTotal} items complete.
          </span>{" "}
          <span className="text-amber-800 text-sm">
            Missing registrations or documents block applications — review the checklist →
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Active opportunities" value={String(active.length)} />
        <Stat label="Pipeline value" value={fmtMoney(pipelineValue)} />
        <Stat label="Weighted forecast" value={fmtMoney(Math.round(weighted))} sub="probability-weighted" />
        <Stat label="Awarded (current)" value={fmtMoney(awardedTotal)} sub={`${awarded.length} awards · ${submitted.length} pending`} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Upcoming deadlines</h2>
          {upcoming.length === 0 && <p className="text-sm text-gray-500">No deadlines on active opportunities.</p>}
          <ul className="space-y-2">
            {upcoming.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/opportunities/${o.id}`} className="truncate hover:underline font-medium">
                  {o.name}
                </Link>
                <span className="text-gray-500 shrink-0">{fmtMoney(o.amount)}</span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${deadlineColor(o.days)}`}>
                  {o.days !== null && o.days < 0 ? `${-o.days}d overdue` : `${o.days}d`}
                </span>
              </li>
            ))}
          </ul>
          {reportsDue.length > 0 && (
            <>
              <h3 className="font-semibold mt-4 mb-2 text-sm text-gray-600">Reports due</h3>
              <ul className="space-y-1">
                {reportsDue.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm">
                    <Link href={`/opportunities/${o.id}`} className="truncate hover:underline">{o.name}</Link>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${deadlineColor(o.days)}`}>{o.days}d</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card p-4">
          <h2 className="font-semibold mb-3">Funnel</h2>
          <ul className="space-y-1.5">
            {funnel.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 text-gray-600">{s.label}</span>
                <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-5 rounded text-white text-xs flex items-center px-1.5"
                    style={{ width: s.count ? `${Math.min(100, s.count * 12 + 8)}%` : "0%" }}
                  >
                    {s.count > 0 ? s.count : ""}
                  </div>
                </div>
                <span className="w-10 text-right text-xs text-gray-400">{Math.round(s.p * 100)}%</span>
              </li>
            ))}
          </ul>
          {renewals.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              ♻ {renewals.length} renewal opportunit{renewals.length === 1 ? "y" : "ies"} flagged — renewals are the cheapest money in grants.
            </p>
          )}
        </div>
      </div>

      {opps.length === 0 && (
        <div className="card p-6 text-center text-gray-600">
          <p className="font-medium mb-2">No opportunities yet.</p>
          <p className="text-sm mb-4">
            Start by checking <Link className="underline" href="/readiness">Readiness</Link>, browsing the seeded{" "}
            <Link className="underline" href="/funders">Funder database</Link>, or searching{" "}
            <Link className="underline" href="/discover">Grants.gov</Link>.
          </p>
          <Link href="/opportunities/new" className="btn">Add your first opportunity</Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
