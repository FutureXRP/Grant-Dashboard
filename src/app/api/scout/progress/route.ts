import { NextResponse } from "next/server";
import { getProgress } from "@/lib/scout";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ progress: getProgress() });
}
