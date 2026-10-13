import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, getAddress, http, isAddress, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ausdFaucet, chain } from "@/lib/config";

export const runtime = "nodejs";

// Agora's AUSD faucet on Monad testnet: requestFunds(recipient) sends 10,000 test AUSD (about once a minute).
const faucetAbi = parseAbi(["function requestFunds(address recipient)"]);

export async function POST(req: Request) {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!ausdFaucet || !key) return NextResponse.json({ error: "Adding test funds isn't set up." }, { status: 503 });
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Malformed request." }, { status: 400 });

  const transport = http(process.env.RELAYER_RPC_URL || chain.rpcUrls.default.http[0]);
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ chain, transport, account });
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: ausdFaucet,
      abi: faucetAbi,
      functionName: "requestFunds",
      args: [getAddress(address)],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    if (receipt.status !== "success") throw new Error("reverted");
    return NextResponse.json({ hash });
  } catch (err) {
    console.error("faucet failed", err);
    return NextResponse.json(
      { error: "Agora's test faucet is busy (it allows one request a minute). Try again shortly." },
      { status: 429 },
    );
  }
}
