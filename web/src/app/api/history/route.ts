import { NextResponse } from "next/server";
import { indexerUrl } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUERY = `query ($id: String!) {
  Withdrawal(where: { payslip_id: { _eq: $id } }, order_by: { timestamp: desc }) {
    amount
    localAmount
    timestamp
    txHash
  }
}`;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("payslip");
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: "payslip id required" }, { status: 400 });
  if (!indexerUrl) return NextResponse.json({ withdrawals: null });
  try {
    const res = await fetch(indexerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { id } }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json();
    if (!res.ok || json.errors) return NextResponse.json({ withdrawals: null });
    return NextResponse.json({ withdrawals: json.data.Withdrawal });
  } catch {
    return NextResponse.json({ withdrawals: null });
  }
}
