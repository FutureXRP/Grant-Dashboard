import { db } from "@/lib/db";
import { setReadiness } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Item = { id: number; item: string; category: string; detail: string; status: string };

export default function Readiness() {
  const items = db().prepare(`SELECT * FROM readiness ORDER BY id`).all() as Item[];
  const ready = items.filter((i) => i.status === "ready").length;
  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-bold">Grant readiness</h1>
      <p className="text-sm text-gray-600">
        These are the prerequisites — no software wins a grant without them. Federal applications are literally
        impossible without active SAM.gov/UEI/Grants.gov registrations, and the playbook forbids submitting proposals
        with invented statistics.
      </p>
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="bg-emerald-600 h-3" style={{ width: `${(ready / Math.max(1, items.length)) * 100}%` }} />
          </div>
          <span className="text-sm font-bold">{ready}/{items.length}</span>
        </div>
      </div>
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="font-bold mb-2">{cat}</h2>
          <div className="card divide-y">
            {items
              .filter((i) => i.category === cat)
              .map((i) => (
                <div key={i.id} className="p-3 flex items-start gap-3">
                  <form className="flex gap-1 shrink-0 pt-0.5">
                    {(["missing", "in_progress", "ready"] as const).map((s) => {
                      const set = setReadiness.bind(null, i.id, s);
                      return (
                        <button
                          key={s}
                          formAction={set}
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${
                            i.status === s
                              ? s === "ready"
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : s === "in_progress"
                                  ? "bg-amber-400 text-gray-900 border-amber-400"
                                  : "bg-gray-700 text-white border-gray-700"
                              : "bg-white text-gray-500 border-gray-300"
                          }`}
                        >
                          {s.replace("_", " ")}
                        </button>
                      );
                    })}
                  </form>
                  <div>
                    <div className="text-sm font-medium">{i.item}</div>
                    <div className="text-xs text-gray-500">{i.detail}</div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
