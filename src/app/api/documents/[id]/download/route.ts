import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readDocFile } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const doc = db().prepare(`SELECT id, name, file_name FROM documents WHERE id=?`).get(id) as
    | { id: number; name: string; file_name: string }
    | undefined;
  if (!doc?.file_name) return NextResponse.json({ error: "No file uploaded for this document" }, { status: 404 });
  const data = await readDocFile(id, doc.file_name);
  if (!data) return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Disposition": `attachment; filename="${doc.file_name}"`,
      "Content-Type": "application/octet-stream",
    },
  });
}
