import { createPublicClient, http, type Address, type Hex } from "viem";
import { fxRateReceiverAbi, paydayPayrollAbi, paydayUSDAbi } from "./abi";
import { addresses, chain } from "./config";
import { currencyKey, type CurrencyCode } from "./currencies";

export const publicClient = createPublicClient({ chain, transport: http() });

export type Quote = {
  currency: CurrencyCode;
  rate: bigint; // 8 decimals
  updatedAt: bigint; // unix seconds
  sources: number;
  updatedBlock: bigint;
};

export async function readQuote(currency: CurrencyCode): Promise<Quote> {
  const [rate, updatedAt, sources, updatedBlock] = await publicClient.readContract({
    address: addresses.fx,
    abi: fxRateReceiverAbi,
    functionName: "getRate",
    args: [currencyKey(currency)],
  });
  return { currency, rate, updatedAt, sources, updatedBlock };
}

export async function readMaxRateAge(): Promise<number> {
  return Number(
    await publicClient.readContract({ address: addresses.payroll, abi: paydayPayrollAbi, functionName: "maxRateAge" }),
  );
}

export type Payslip = {
  id: bigint;
  employer: Address;
  freelancer: Address;
  claimSigner: Address;
  currency: Hex;
  lockedRate: bigint;
  deposit: bigint;
  withdrawn: bigint;
  refunded: bigint;
  start: bigint;
  end: bigint;
  stoppedAt: bigint;
  claimDeadline: bigint;
  createdBlock: bigint;
  rateBlock: bigint;
  voided: boolean;
};

export async function readPayslip(id: bigint): Promise<Payslip> {
  const p = await publicClient.readContract({
    address: addresses.payroll,
    abi: paydayPayrollAbi,
    functionName: "getPayslip",
    args: [id],
  });
  return { id, ...p };
}

export async function readPayslips(ids: readonly bigint[]): Promise<Payslip[]> {
  return Promise.all(ids.map(readPayslip));
}

export async function readEmployerPayslipIds(employer: Address) {
  return publicClient.readContract({
    address: addresses.payroll,
    abi: paydayPayrollAbi,
    functionName: "payslipsOfEmployer",
    args: [employer],
  });
}

export async function readFreelancerPayslipIds(freelancer: Address) {
  return publicClient.readContract({
    address: addresses.payroll,
    abi: paydayPayrollAbi,
    functionName: "payslipsOfFreelancer",
    args: [freelancer],
  });
}

export async function readUsdBalance(owner: Address) {
  return publicClient.readContract({ address: addresses.usd, abi: paydayUSDAbi, functionName: "balanceOf", args: [owner] });
}

export async function readAllowance(owner: Address) {
  return publicClient.readContract({
    address: addresses.usd,
    abi: paydayUSDAbi,
    functionName: "allowance",
    args: [owner, addresses.payroll],
  });
}

/** Earned so far at `nowSeconds` (fractional), mirroring PaydayPayroll._earned so the UI can tick smoothly. */
export function earnedAt(p: Payslip, nowSeconds: number): number {
  const start = Number(p.start);
  const end = Number(p.end);
  let until = end;
  if (p.stoppedAt !== 0n && Number(p.stoppedAt) < until) until = Number(p.stoppedAt);
  if (nowSeconds < until) until = nowSeconds;
  if (until <= start) return 0;
  return (Number(p.deposit) * (until - start)) / (end - start) / 1e6;
}

export type PayslipStatus = "unclaimed" | "expired" | "refunded" | "scheduled" | "streaming" | "stopped" | "complete";

export function payslipStatus(p: Payslip, nowSeconds: number): PayslipStatus {
  if (p.voided) return "refunded";
  if (p.stoppedAt !== 0n) return "stopped";
  if (nowSeconds >= Number(p.end)) return "complete";
  if (p.freelancer === "0x0000000000000000000000000000000000000000") {
    return nowSeconds > Number(p.claimDeadline) ? "expired" : "unclaimed";
  }
  if (nowSeconds < Number(p.start)) return "scheduled";
  return "streaming";
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/** Finds the CRE report transaction that wrote `currency` in `block` (single-block log query). */
export async function findRateTx(currency: CurrencyCode, block: bigint): Promise<Hex | undefined> {
  if (block === 0n) return undefined;
  const logs = await publicClient.getContractEvents({
    address: addresses.fx,
    abi: fxRateReceiverAbi,
    eventName: "RateUpdated",
    args: { currency: currencyKey(currency) },
    fromBlock: block,
    toBlock: block,
  });
  return logs[0]?.transactionHash ?? undefined;
}

/** Finds the funding transaction of a payslip from the block it was created in. */
export async function findFundingTx(id: bigint, block: bigint): Promise<Hex | undefined> {
  const logs = await publicClient.getContractEvents({
    address: addresses.payroll,
    abi: paydayPayrollAbi,
    eventName: "PayslipCreated",
    args: { id },
    fromBlock: block,
    toBlock: block,
  });
  return logs[0]?.transactionHash ?? undefined;
}

// ------------------------------------------------------------ chain clock
// The contract judges freshness, expiry and earnings by block time. If the chain's clock runs ahead of
// this device (or a test network was fast-forwarded), follow the chain so the UI never promises
// something the contract will refuse. A chain that is merely idle (behind) is ignored.
let clockOffset = 0;
let lastSync = 0;

export function chainNow(): number {
  const wall = Date.now() / 1000;
  if (wall - lastSync > 10) {
    lastSync = wall;
    publicClient
      .getBlock()
      .then((b) => {
        clockOffset = Math.max(0, Number(b.timestamp) - Date.now() / 1000);
      })
      .catch(() => {});
  }
  return wall + clockOffset;
}
