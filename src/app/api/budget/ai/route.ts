import { NextRequest, NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai";
import { suggestBudgetLines, generateBudgetNarrative } from "@/lib/budget";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the AI agents." },
      { status: 503 }
    );
  }
  let body: { mode?: string; opportunityId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = Number(body.opportunityId);
  if (!id) return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  try {
    if (body.mode === "suggest") {
      const result = await suggestBudgetLines(id);
      return NextResponse.json(result);
    }
    if (body.mode === "narrative") {
      const narrative = await generateBudgetNarrative(id);
      return NextResponse.json({ narrative });
    }
    return NextResponse.json({ error: "mode must be 'suggest' or 'narrative'" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Budget AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
