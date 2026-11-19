import { NextRequest, NextResponse } from "next/server";
import { dismissKeyed, restoreKeyed, watchKey } from "@/lib/scout";
import { q } from "@/lib/db";

export async function POST(req: NextRequest) {
  let body: {
    key?: string; number?: string; source?: string; title?: string; restore?: boolean;
    received?: boolean; funder?: string; url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // A dismissal is keyed by the federal opportunity number, or by a hash of
  // source+title for page-watch findings.
  const key =
    body.key ??
    (body.number
      ? String(body.number)
      : body.source && body.title
        ? watchKey(body.source, body.title)
        : null);
  if (!key) {
    return NextResponse.json({ error: "Provide key, number, or source+title" }, { status: 400 });
  }
  if (body.restore) {
    await restoreKeyed(key);
    return NextResponse.json({ ok: true, key, restored: true });
  }
  await dismissKeyed(key, String(body.title ?? ""));

  // "Already received": besides never showing the lead again, book it in the
  // pipeline as an awarded grant so the dashboard's awarded stat reflects it.
  if (body.received && body.title) {
    const title = String(body.title);
    const existing = await q.get<{ id: number }>(`SELECT id FROM opportunities WHERE name=?`, [title]);
    if (existing) {
      await q.run(`UPDATE opportunities SET stage='awarded', outcome='awarded', updated_at=datetime('now') WHERE id=?`, [
        existing.id,
      ]);
      return NextResponse.json({ ok: true, key, received: true, opportunityId: existing.id });
    }
    const res = await q.run(
      `INSERT INTO opportunities (name, funder_name, type, stage, outcome, url, notes) VALUES (?, ?, 'foundation', 'awarded', 'awarded', ?, ?)`,
      [
        title,
        String(body.funder ?? ""),
        String(body.url ?? ""),
        "Marked as already received from the scout. [VERIFY: award amount — enter it so dashboard totals are right.]",
      ]
    );
    return NextResponse.json({ ok: true, key, received: true, opportunityId: res.lastInsertRowid });
  }
  return NextResponse.json({ ok: true, key });
}
