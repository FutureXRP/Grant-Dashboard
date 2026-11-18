import { NextRequest, NextResponse } from "next/server";
import { importGrantCsv } from "@/lib/import-grants";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — grant lists are small

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a CSV file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (2 MB max)" }, { status: 413 });
  }
  const addStrongToPipeline = form.get("addStrongToPipeline") === "on" || form.get("addStrongToPipeline") === "true";
  try {
    const summary = await importGrantCsv(await file.text(), { addStrongToPipeline });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
