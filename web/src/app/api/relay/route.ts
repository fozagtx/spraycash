import { NextResponse } from "next/server";
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  getAddress,
  http,
  isAddress,
  isHex,
  slice,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { spraycashForwarderAbi, spraycashPayrollAbi, spraycashUSDAbi } from "@/lib/abi";
import { addresses, chain } from "@/lib/config";

export const runtime = "nodejs";

// The relayer only forwards these calls. Everything else is refused, so the funded key
// can't be used as a general-purpose fee sponsor.
const ALLOWED: Record<string, { abi: Abi; functions: string[] }> = {
  payroll: {
    abi: spraycashPayrollAbi as Abi,
    functions: ["createPayslip", "claim", "withdraw", "stop", "refundUnclaimed"],
  },
  usd: { abi: spraycashUSDAbi as Abi, functions: ["faucet", "approve"] },
};

const MAX_GAS = 1_000_000n;

// Plain-language messages for contract errors. The product never shows raw revert data.
const FRIENDLY: Record<string, string> = {
  StaleRate: "Rate refreshing… the exchange rate is too old to lock. Try again in a minute.",
  QuoteChanged: "The rate just updated. Review the new rate and confirm again.",
  UnsupportedCurrency: "We don't have a rate for that currency yet.",
  InsufficientBalance: "Your payroll balance is lower than this payslip. Add funds first.",
  ERC20InsufficientBalance: "Your payroll balance is lower than this payslip. Add funds first.",
  ERC20InsufficientAllowance: "Payroll isn't set up to use your balance yet. Try again.",
  InvalidAmount: "Enter an amount above zero.",
  InvalidDuration: "Pick a pay period.",
  AlreadyClaimed: "This pay link has already been used.",
  ClaimExpired: "This pay link has expired. Ask your client for a new one.",
  ClaimNotExpired: "This pay link hasn't expired yet.",
  InvalidClaimSignature: "This pay link isn't valid. Check you copied the whole link.",
  AlreadyStopped: "Pay is already stopped.",
  AlreadyEnded: "This pay period has already ended.",
  Voided: "This payslip was refunded and is closed.",
  NothingToWithdraw: "Nothing to withdraw yet. Give it a few seconds.",
  NotEmployer: "Only the client who created this payslip can do that.",
  NotFreelancer: "This payslip belongs to a different account.",
  UnknownPayslip: "We couldn't find that payslip.",
  FaucetNotNeeded: "You already have funds.",
};

let cachedRelayer: ReturnType<typeof makeRelayer> | null = null;
function makeRelayer() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) return null;
  const transport = http(process.env.RELAYER_RPC_URL || chain.rpcUrls.default.http[0]);
  const account = privateKeyToAccount(key);
  return {
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport, account }),
  };
}
function relayer() {
  cachedRelayer ??= makeRelayer();
  return cachedRelayer;
}

type RequestBody = {
  request?: {
    from?: string;
    to?: string;
    value?: string;
    gas?: string;
    deadline?: number;
    data?: string;
    signature?: string;
  };
};

function fail(error: string, status = 400, code?: string) {
  return NextResponse.json({ error, code }, { status });
}

function decodeRevert(err: unknown): { code?: string; message: string } {
  const abis = [spraycashPayrollAbi, spraycashUSDAbi, spraycashForwarderAbi] as Abi[];
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const raw = (reverted?.raw ?? (err.walk((e) => isHex((e as { data?: unknown }).data)) as { data?: Hex } | null)?.data) as
      | Hex
      | undefined;
    if (raw && raw.length >= 10) {
      for (const abi of abis) {
        try {
          const decoded = decodeErrorResult({ abi, data: raw });
          return { code: decoded.errorName, message: FRIENDLY[decoded.errorName] ?? "That didn't go through." };
        } catch {}
      }
    }
  }
  return { message: "That didn't go through. Try again." };
}

export async function POST(req: Request) {
  const r = relayer();
  if (!r) return fail("Spraycash isn't set up to send payments right now.", 503, "RelayerNotConfigured");

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const q = body.request;
  if (!q || !q.from || !q.to || !q.data || !q.signature || q.gas === undefined || q.deadline === undefined) {
    return fail("Malformed request.");
  }
  if (!isAddress(q.from) || !isAddress(q.to) || !isHex(q.data) || !isHex(q.signature)) return fail("Malformed request.");
  if ((q.value ?? "0") !== "0") return fail("Malformed request.");

  const to = getAddress(q.to);
  const target =
    to === getAddress(addresses.payroll) ? ALLOWED.payroll : to === getAddress(addresses.usd) ? ALLOWED.usd : undefined;
  if (!target) return fail("That action isn't supported.", 403);
  const selector = slice(q.data as Hex, 0, 4);
  const allowedSelectors = target.functions.map((name) => {
    const item = target.abi.find((x) => x.type === "function" && x.name === name);
    return toFunctionSelector(item as Parameters<typeof toFunctionSelector>[0]);
  });
  if (!allowedSelectors.includes(selector)) return fail("That action isn't supported.", 403);

  const gas = BigInt(q.gas);
  if (gas <= 0n || gas > MAX_GAS) return fail("Malformed request.");

  const request = {
    from: getAddress(q.from),
    to,
    value: 0n,
    gas,
    deadline: Number(q.deadline),
    data: q.data as Hex,
    signature: q.signature as Hex,
  };

  // 1. The signature must be valid and unexpired.
  const valid = await r.publicClient.readContract({
    address: addresses.forwarder,
    abi: spraycashForwarderAbi,
    functionName: "verify",
    args: [request],
  });
  if (!valid) return fail("This request expired or was already used. Try again.", 400, "InvalidRequest");

  // 2. Dry-run the inner call exactly as the forwarder would make it (ERC-2771: sender appended),
  //    so contract errors come back as readable messages instead of a generic failure.
  try {
    await r.publicClient.call({
      account: addresses.forwarder,
      to: request.to,
      data: concat([request.data, request.from]),
      gas: request.gas,
    });
  } catch (err) {
    const { code, message } = decodeRevert(err);
    return fail(message, 422, code);
  }

  // 3. Submit and wait. Monad blocks are sub-second, so this returns quickly.
  try {
    const { request: tx } = await r.publicClient.simulateContract({
      account: r.account,
      address: addresses.forwarder,
      abi: spraycashForwarderAbi,
      functionName: "execute",
      args: [request],
    });
    const hash = await r.walletClient.writeContract(tx);
    const receipt = await r.publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    if (receipt.status !== "success") return fail("That didn't go through. Try again.", 502, "Reverted");
    return NextResponse.json({ hash, blockNumber: receipt.blockNumber.toString() });
  } catch (err) {
    const { code, message } = decodeRevert(err);
    console.error("relay failed", err);
    return fail(message, 502, code);
  }
}

export async function GET() {
  const r = relayer();
  return NextResponse.json({ ready: !!r, relayer: r?.account.address as Address | undefined });
}
