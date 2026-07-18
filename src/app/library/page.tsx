import { db } from "@/lib/db";
import { updateDocument, saveNarrative } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Doc = { id: number; name: string; category: string; status: string; expires: string; notes: string };
type Narr = { id: number; category: string; title: string; content: string; updated_at: string };

export default function Library() {
  const d = db();
  const docs = d.prepare(`SELECT * FROM documents ORDER BY category, name`).all() as Doc[];
  const narrs = d.prepare(`SELECT * FROM narratives ORDER BY category, title`).all() as Narr[];
  const expiringSoon = docs.filter((doc) => {
    if (!doc.expires) return false;
    const days = (new Date(doc.expires).getTime() - Date.now()) / 86400000;
    return days < 60;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Library</h1>

      {/* Documents tracker */}
      <section className="space-y-2">
        <h2 className="font-bold text-lg">Attachment tracker</h2>
        <p className="text-sm text-gray-500">
          The ~20 attachments nearly every application requests. Keep one current copy of each in a shared drive; track status and expiration here.
        </p>
        {expiringSoon.length > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ {expiringSoon.length} document(s) expired or expiring within 60 days.
          </p>
        )}
        <div className="card divide-y">
          {docs.map((doc) => (
            <form key={doc.id} action={updateDocument.bind(null, doc.id)} className="flex items-center gap-3 p-2.5 text-sm">
              <span className="w-56 shrink-0 font-medium">{doc.name}</span>
              <span className="w-24 shrink-0 text-xs text-gray-400">{doc.category}</span>
              <select name="status" defaultValue={doc.status} className="input w-28">
                <option value="missing">missing</option>
                <option value="draft">draft</option>
                <option value="current">current</option>
                <option value="expired">expired</option>
              </select>
              <input name="expires" type="date" defaultValue={doc.expires} className="input w-40" title="Expiration" />
              <input name="notes" defaultValue={doc.notes} className="input flex-1" placeholder="Location / notes" />
              <button className="btn-secondary text-xs shrink-0">Save</button>
            </form>
          ))}
        </div>
      </section>

      {/* Narrative library */}
      <section className="space-y-2">
        <h2 className="font-bold text-lg">Narrative library</h2>
        <p className="text-sm text-gray-500">
          Approved reusable language — the AI agents draft from these. Keep them current; anything marked NEEDS VERIFIED DATA must be completed before proposals go out.
        </p>
        <div className="space-y-2">
          {narrs.map((n) => (
            <details key={n.id} className="card">
              <summary className="cursor-pointer p-3 flex items-center gap-3 text-sm">
                <span className="text-xs text-gray-400 w-40 shrink-0">{n.category}</span>
                <span className="font-medium flex-1">{n.title}</span>
                {n.content.includes("[") && n.content.includes("VERIF") && (
                  <span className="text-[10px] bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-semibold">needs data</span>
                )}
              </summary>
              <form action={saveNarrative.bind(null, n.id)} className="px-4 pb-4 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <input name="category" defaultValue={n.category} className="input" />
                  <input name="title" defaultValue={n.title} className="input" />
                </div>
                <textarea name="content" rows={6} defaultValue={n.content} className="input text-xs font-mono" />
                <button className="btn-secondary">Save</button>
              </form>
            </details>
          ))}
        </div>
        <details className="card">
          <summary className="cursor-pointer p-3 text-sm font-medium">+ Add narrative</summary>
          <form action={saveNarrative.bind(null, null)} className="px-4 pb-4 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <input name="category" placeholder="Category" className="input" />
              <input name="title" placeholder="Title" className="input" />
            </div>
            <textarea name="content" rows={6} placeholder="Approved language…" className="input text-xs font-mono" />
            <button className="btn">Add</button>
          </form>
        </details>
      </section>
    </div>
  );
}
