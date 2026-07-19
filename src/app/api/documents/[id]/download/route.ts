import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { db, UPLOADS_DIR } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const doc = db().prepare(`SELECT id, name, file_name FROM documents WHERE id=?`).get(id) as
    | { id: number; name: string; file_name: string }
    | undefined;
  if (!doc?.file_name) return NextResponse.json({ error: "No file uploaded for this document" }, { status: 404 });
  const filePath = path.join(UPLOADS_DIR, String(id), path.basename(doc.file_name));
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  const data = fs.readFileSync(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Disposition": `attachment; filename="${doc.file_name}"`,
      "Content-Type": "application/octet-stream",
    },
  });
}
