import { NextRequest, NextResponse } from "next/server";
import { readApplication, answerApplication, loadForm, saveAnswers, type AppAnswer } from "@/lib/appform";
import { aiConfigured } from "@/lib/ai";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ form: await loadForm(Number(id)) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunityId = Number(id);
  if (!Number.isFinite(opportunityId)) {
    return NextResponse.json({ error: "Bad opportunity id" }, { status: 400 });
  }
  let body: { action?: string; url?: string; answers?: Record<string, AppAnswer> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "read") {
      if (!aiConfigured()) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
      }
      const url = String(body.url || "").trim();
      if (!/^https?:\/\//.test(url)) {
        return NextResponse.json({ error: "Enter a full http(s) link to the application page." }, { status: 400 });
      }
      const form = await readApplication(opportunityId, url);
      return NextResponse.json({ form });
    }
    if (body.action === "answer") {
      if (!aiConfigured()) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
      }
      const form = await answerApplication(opportunityId);
      return NextResponse.json({ form });
    }
    if (body.action === "save") {
      await saveAnswers(opportunityId, body.answers ?? {});
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action must be 'read', 'answer', or 'save'" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
