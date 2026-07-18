import Link from "next/link";
import { db } from "@/lib/db";
import { STAGES, fmtMoney, daysUntil, deadlineColor } from "@/lib/stages";
import { setStage } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Opp = {
  id: number; name: string; funder_name: string; stage: string;
  amount: number; deadline: string;
};

export default function Pipeline() {
  const opps = db().prepare(`SELECT * FROM opportunities ORDER BY deadline = '', deadline`).all() as Opp[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <Link href="/opportunities/new" className="btn">+ New Opportunity</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((s) => {
          const items = opps.filter((o) => o.stage === s.key);
          const total = items.reduce((sum, o) => sum + (o.amount || 0), 0);
          return (
            <div key={s.key} className="w-64 shrink-0">
              <div className="flex items-baseline justify-between px-1 mb-2">
                <h2 className="text-sm font-bold">{s.label}</h2>
                <span className="text-xs text-gray-500">
                  {Math.round(s.p * 100)}% · {fmtMoney(total)}
                </span>
              </div>
              <div className="space-y-2 min-h-24 bg-gray-100 rounded-lg p-2">
                {items.map((o) => {
                  const days = daysUntil(o.deadline);
                  return (
                    <div key={o.id} className="card p-2.5">
                      <Link href={`/opportunities/${o.id}`} className="text-sm font-medium hover:underline block leading-snug">
                        {o.name}
                      </Link>
                      <div className="text-xs text-gray-500 mt-0.5">{o.funder_name}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs font-semibold">{fmtMoney(o.amount)}</span>
                        {days !== null && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${deadlineColor(days)}`}>
                            {days < 0 ? "overdue" : `${days}d`}
                          </span>
                        )}
                      </div>
                      <form className="mt-2 flex gap-1">
                        <MoveButton oppId={o.id} stageKey={s.key} dir={-1} />
                        <MoveButton oppId={o.id} stageKey={s.key} dir={1} />
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">
        Stage percentages are the playbook&apos;s probability weights — the dashboard&apos;s weighted forecast is Σ (amount × stage %).
      </p>
    </div>
  );
}

function MoveButton({ oppId, stageKey, dir }: { oppId: number; stageKey: string; dir: 1 | -1 }) {
  const idx = STAGES.findIndex((s) => s.key === stageKey);
  const target = STAGES[idx + dir];
  if (!target) return <span className="flex-1" />;
  const move = setStage.bind(null, oppId, target.key);
  return (
    <button
      formAction={move}
      className="flex-1 rounded border border-gray-200 text-[10px] py-0.5 text-gray-600 hover:bg-gray-50"
      title={`Move to ${target.label}`}
    >
      {dir === -1 ? "←" : "→"} {target.label}
    </button>
  );
}
