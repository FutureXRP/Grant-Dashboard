import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { db, UPLOADS_DIR } from "@/lib/db";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const id = Number(form.get("id"));
  const file = form.get("file");
  if (!id || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Document id and a non-empty file are required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (25 MB max)" }, { status: 413 });
  }
  const d = db();
  const doc = d.prepare(`SELECT id, file_name, status FROM documents WHERE id=?`).get(id) as
    | { id: number; file_name: string; status: string }
    | undefined;
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const safeName = path.basename(file.name).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload";
  const dir = path.join(UPLOADS_DIR, String(id));
  fs.mkdirSync(dir, { recursive: true });
  // One file per document: remove the previous upload if the name changed.
  if (doc.file_name && doc.file_name !== safeName) {
    try {
      fs.unlinkSync(path.join(dir, doc.file_name));
    } catch {
      /* previous file already gone */
    }
  }
  fs.writeFileSync(path.join(dir, safeName), Buffer.from(await file.arrayBuffer()));
  d.prepare(
    `UPDATE documents SET file_name=?, status = CASE WHEN status='missing' THEN 'current' ELSE status END, updated_at=datetime('now') WHERE id=?`
  ).run(safeName, id);
  return NextResponse.json({ ok: true, file_name: safeName });
}
