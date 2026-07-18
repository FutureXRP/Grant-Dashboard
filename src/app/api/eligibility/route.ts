import { NextRequest, NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai";
import { generateEligibilityQuestions, evaluateEligibility } from "@/lib/eligibility";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the AI agents." },
      { status: 503 }
    );
  }
  let body: { mode?: string; opportunityId?: number; answers?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const opportunityId = Number(body.opportunityId);
  if (!opportunityId) {
    return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  }
  try {
    if (body.mode === "questions") {
      const questions = await generateEligibilityQuestions(opportunityId);
      return NextResponse.json({ questions });
    }
    if (body.mode === "verdict") {
      const verdict = await evaluateEligibility(opportunityId, body.answers ?? {});
      return NextResponse.json({ verdict });
    }
    return NextResponse.json({ error: "mode must be 'questions' or 'verdict'" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Eligibility screening failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
