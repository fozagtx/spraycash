import "server-only";
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { spraycashUSDAbi } from "@/lib/abi";
import { addresses, ausdFaucet, chain } from "@/lib/config";

const faucetAbi = parseAbi(["function requestFunds(address recipient)"]);
const AUSD = 1_000_000n;
const TEST_FUND_AMOUNT = 10_000n * AUSD;
const TOP_UP_THRESHOLD = 300_000n * AUSD;
const TOP_UP_INTERVAL_MS = 65_000;
const globalState = globalThis as typeof globalThis & {
  spraycashFundsTopUpStarted?: boolean;
  spraycashTestFundWriteQueue?: Promise<void>;
};

function serializeWrite<T>(write: () => Promise<T>): Promise<T> {
  const queue = globalState.spraycashTestFundWriteQueue ?? Promise.resolve();
  const result = queue.then(write, write);
  globalState.spraycashTestFundWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function createRelayer() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY is unset");
  const transport = http(chain.rpcUrls.default.http[0]);
  const account = privateKeyToAccount(key);
  return {
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport, account }),
  };
}

async function waitForReceipt(hash: Hex, publicClient: ReturnType<typeof createRelayer>["publicClient"]) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (receipt.status !== "success") throw new Error(`test funds transaction reverted: ${hash}`);
  return hash;
}

async function requestFunds(to: Address, relayer: ReturnType<typeof createRelayer>): Promise<Hex> {
  if (!ausdFaucet) throw new Error("AUSD faucet is not configured");
  const { request } = await relayer.publicClient.simulateContract({
    account: relayer.account,
    address: ausdFaucet,
    abi: faucetAbi,
    functionName: "requestFunds",
    args: [to],
  });
  const hash = await relayer.walletClient.writeContract(request);
  return waitForReceipt(hash, relayer.publicClient);
}

async function transferTestFunds(to: Address, relayer: ReturnType<typeof createRelayer>): Promise<Hex> {
  const { request } = await relayer.publicClient.simulateContract({
    account: relayer.account,
    address: addresses.usd,
    abi: spraycashUSDAbi,
    functionName: "transfer",
    args: [to, TEST_FUND_AMOUNT],
  });
  const hash = await relayer.walletClient.writeContract(request);
  return waitForReceipt(hash, relayer.publicClient);
}

export function sendTestFunds(to: Address): Promise<Hex> {
  return serializeWrite(async () => {
    const relayer = createRelayer();
    const balance = await relayer.publicClient.readContract({
      address: addresses.usd,
      abi: spraycashUSDAbi,
      functionName: "balanceOf",
      args: [relayer.account.address],
    });
    if (balance >= TEST_FUND_AMOUNT) return transferTestFunds(to, relayer);
    return requestFunds(to, relayer);
  });
}

export function startFundsTopUp() {
  if (globalState.spraycashFundsTopUpStarted) return;
  globalState.spraycashFundsTopUpStarted = true;

  if (!process.env.RELAYER_PRIVATE_KEY || !ausdFaucet) {
    console.log(
      `AUSD pool top-up noop: ${!process.env.RELAYER_PRIVATE_KEY ? "RELAYER_PRIVATE_KEY is unset" : "faucet is unset"}`,
    );
    return;
  }

  let relayer: ReturnType<typeof createRelayer>;
  try {
    relayer = createRelayer();
  } catch (error) {
    console.error("AUSD pool top-up failed to start", error);
    return;
  }

  let tickRunning = false;
  const tick = async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      await serializeWrite(async () => {
        const balance = await relayer.publicClient.readContract({
          address: addresses.usd,
          abi: spraycashUSDAbi,
          functionName: "balanceOf",
          args: [relayer.account.address],
        });
        if (balance >= TOP_UP_THRESHOLD) return;
        const hash = await requestFunds(relayer.account.address, relayer);
        console.log(`AUSD pool topped up ${hash}`);
      });
    } catch (error) {
      console.warn("AUSD pool top-up failed", error);
    } finally {
      tickRunning = false;
    }
  };

  void tick();
  setInterval(() => void tick(), TOP_UP_INTERVAL_MS);
}
