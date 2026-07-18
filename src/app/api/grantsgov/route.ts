import { NextRequest, NextResponse } from "next/server";

// Proxy to the free public Grants.gov Search2 API (no key required).
export async function POST(req: NextRequest) {
  let body: { keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const keyword = String(body.keyword || "").slice(0, 200);
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  try {
    const res = await fetch("https://api.grants.gov/v1/api/search2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword,
        rows: 25,
        oppStatuses: "forecasted|posted",
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Grants.gov returned ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    type Hit = {
      id?: string | number;
      number?: string;
      title?: string;
      agencyName?: string;
      agency?: string;
      openDate?: string;
      closeDate?: string;
      oppStatus?: string;
    };
    const hits: Hit[] = data?.data?.oppHits ?? [];
    return NextResponse.json({
      results: hits.map((h) => ({
        id: h.id,
        number: h.number ?? "",
        title: h.title ?? "",
        agency: h.agencyName ?? h.agency ?? "",
        openDate: h.openDate ?? "",
        closeDate: h.closeDate ?? "",
        status: h.oppStatus ?? "",
        url: h.id ? `https://www.grants.gov/search-results-detail/${h.id}` : "",
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json(
      { error: `Could not reach Grants.gov: ${message}` },
      { status: 502 }
    );
  }
}
