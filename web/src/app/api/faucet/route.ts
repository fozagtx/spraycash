import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { ausdFaucet } from "@/lib/config";
import { sendTestFunds } from "@/lib/test-funds";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!ausdFaucet || !key) return NextResponse.json({ error: "Adding test funds isn't set up." }, { status: 503 });
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Malformed request." }, { status: 400 });

  try {
    const hash = await sendTestFunds(getAddress(address));
    return NextResponse.json({ hash });
  } catch (err) {
    console.error("faucet failed", err);
    return NextResponse.json(
      { error: "Agora's test faucet is busy (it allows one request a minute). Try again shortly." },
      { status: 429 },
    );
  }
}
