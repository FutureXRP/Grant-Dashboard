import { NextRequest, NextResponse } from "next/server";
import { runAgent, aiConfigured, AgentAction } from "@/lib/ai";

export const maxDuration = 300;

const ACTIONS: AgentAction[] = [
  "analyze_nofo",
  "draft_section",
  "improve",
  "shorten",
  "smart_objectives",
  "red_team",
  "compliance_check",
];

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the AI agents." },
      { status: 503 }
    );
  }
  let body: { action?: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = body.action as AgentAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
  try {
    const output = await runAgent(action, {
      opportunityId: body.opportunityId ? Number(body.opportunityId) : undefined,
      sectionKey: typeof body.sectionKey === "string" ? body.sectionKey : undefined,
      sectionTitle: typeof body.sectionTitle === "string" ? body.sectionTitle : undefined,
      text: typeof body.text === "string" ? body.text : undefined,
      targetWords: body.targetWords ? Number(body.targetWords) : undefined,
    });
    return NextResponse.json({ output });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
