import { NextRequest, NextResponse } from "next/server";
import { runDiscovery, latestDiscovery } from "@/lib/discover";
import { addSource } from "@/lib/scout";
import { aiConfigured } from "@/lib/ai";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ report: await latestDiscovery() });
}

export async function POST(req: NextRequest) {
  let body: { action?: string; name?: string; url?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.action === "watch") {
    const name = String(body.name || "").trim();
    const url = String(body.url || "").trim();
    if (!name || !/^https?:\/\//.test(url)) {
      return NextResponse.json({ error: "name and a valid http(s) url required" }, { status: 400 });
    }
    await addSource(name, url, String(body.kind || "foundation"));
    return NextResponse.json({ ok: true, watched: url });
  }
  if (body.action === "run") {
    if (!aiConfigured()) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set. Add it to the environment to enable discovery." },
        { status: 503 }
      );
    }
    try {
      const report = await runDiscovery();
      return NextResponse.json({ report });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Discovery run failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "action must be 'run' or 'watch'" }, { status: 400 });
}
