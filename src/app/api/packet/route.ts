import { NextRequest, NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai";
import { buildPacket } from "@/lib/packet";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the AI agents." },
      { status: 503 }
    );
  }
  let body: { opportunityId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const opportunityId = Number(body.opportunityId);
  if (!opportunityId) return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  try {
    const packet = await buildPacket(opportunityId);
    return NextResponse.json({ packet });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Packet build failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
