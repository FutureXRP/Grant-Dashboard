import { db } from "@/lib/db";
import { updateFunderNotes } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Funder = {
  id: number; name: string; type: string; tier: number; focus: string;
  award_range: string; projects: string; website: string; notes: string;
  contact_name: string; contact_email: string; relationship: string;
  last_contact: string; next_followup: string;
};

const TYPE_ORDER = ["federal", "state", "foundation", "healthcare", "corporate", "tribal"];
const TYPE_LABELS: Record<string, string> = {
  federal: "Federal agencies",
  state: "Oklahoma state agencies",
  foundation: "Foundations",
  healthcare: "Healthcare funders",
  corporate: "Corporate giving",
  tribal: "Tribal partnerships",
};

export default async function Funders({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;
  const funders = db().prepare(`SELECT * FROM funders ORDER BY tier, name`).all() as Funder[];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Funder database</h1>
      <p className="text-sm text-gray-500">
        Seeded from the playbook (Sections 4–6). Tier 1 = pursue every year. Verify current priorities and windows before applying.
      </p>
      {TYPE_ORDER.map((type) => {
        const group = funders.filter((f) => f.type === type);
        if (group.length === 0) return null;
        return (
          <section key={type}>
            <h2 className="font-bold text-lg mb-2">{TYPE_LABELS[type] ?? type}</h2>
            <div className="space-y-2">
              {group.map((f) => (
                <details key={f.id} className="card" open={open === String(f.id)}>
                  <summary className="cursor-pointer p-3 flex items-center gap-3">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${f.tier === 1 ? "bg-emerald-100 text-emerald-800" : f.tier === 2 ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      T{f.tier}
                    </span>
                    <span className="font-medium text-sm flex-1">{f.name}</span>
                    <span className="text-xs text-gray-500">{f.award_range}</span>
                    <span className={`text-[10px] rounded px-1.5 py-0.5 ${f.relationship === "cold" ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-800"}`}>
                      {f.relationship}
                    </span>
                  </summary>
                  <div className="px-4 pb-4 space-y-3 text-sm">
                    <p><span className="font-semibold">Focus:</span> {f.focus}</p>
                    <p><span className="font-semibold">Project fits:</span> {f.projects}</p>
                    {f.website && (
                      <a href={f.website} target="_blank" className="text-emerald-700 underline text-xs">
                        {f.website}
                      </a>
                    )}
                    <form action={updateFunderNotes.bind(null, f.id)} className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div>
                        <label className="label">Contact name</label>
                        <input name="contact_name" defaultValue={f.contact_name} className="input" />
                      </div>
                      <div>
                        <label className="label">Contact email</label>
                        <input name="contact_email" defaultValue={f.contact_email} className="input" />
                      </div>
                      <div>
                        <label className="label">Relationship</label>
                        <select name="relationship" defaultValue={f.relationship} className="input">
                          {["cold", "warm", "established", "partner", "champion"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label">Last contact</label>
                          <input name="last_contact" type="date" defaultValue={f.last_contact} className="input" />
                        </div>
                        <div>
                          <label className="label">Next follow-up</label>
                          <input name="next_followup" type="date" defaultValue={f.next_followup} className="input" />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="label">Notes</label>
                        <textarea name="notes" rows={2} defaultValue={f.notes} className="input" />
                      </div>
                      <div className="col-span-2">
                        <button className="btn-secondary">Save</button>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
