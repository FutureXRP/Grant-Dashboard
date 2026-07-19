import { NextRequest, NextResponse } from "next/server";
import { dismissKeyed, restoreKeyed, watchKey } from "@/lib/scout";

export async function POST(req: NextRequest) {
  let body: { key?: string; number?: string; source?: string; title?: string; restore?: boolean };
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
    restoreKeyed(key);
    return NextResponse.json({ ok: true, key, restored: true });
  }
  dismissKeyed(key, String(body.title ?? ""));
  return NextResponse.json({ ok: true, key });
}
