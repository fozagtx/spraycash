import "server-only";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fxRateReceiverAbi } from "@/lib/abi";
import { addresses, chain, rateSources } from "@/lib/config";

const REFRESH_AFTER_SECONDS = 240;
const REFRESH_INTERVAL_MS = 60_000;
const globalState = globalThis as typeof globalThis & { spraycashRateRefresherStarted?: boolean };

type RateApiResponse = {
  rates?: Record<string, number>;
  result?: string;
};

function isAddressEqual(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}

async function fetchRates() {
  const [frankfurterResponse, erApiResponse] = await Promise.all([
    fetch(rateSources.frankfurter),
    fetch(rateSources.erApi),
  ]);
  if (!frankfurterResponse.ok || !erApiResponse.ok) {
    throw new Error(`rate source HTTP status ${frankfurterResponse.status}/${erApiResponse.status}`);
  }

  const [frankfurter, erApi] = (await Promise.all([
    frankfurterResponse.json(),
    erApiResponse.json(),
  ])) as [RateApiResponse, RateApiResponse];
  if (!frankfurter.rates || !erApi.rates || erApi.result !== "success") {
    throw new Error("rate source returned an invalid response");
  }

  return { frankfurter: frankfurter.rates, erApi: erApi.rates };
}

function validRate(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function startRateRefresher() {
  if (globalState.spraycashRateRefresherStarted) return;
  globalState.spraycashRateRefresherStarted = true;

  if (!process.env.RELAYER_PRIVATE_KEY) {
    console.log("rate refresher noop: RELAYER_PRIVATE_KEY is unset");
    return;
  }
  if (chain.id === 31337) {
    console.log("rate refresher noop: local chain");
    return;
  }

  void (async () => {
    try {
      const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);
      const transport = http(chain.rpcUrls.default.http[0]);
      const publicClient = createPublicClient({ chain, transport });
      const walletClient = createWalletClient({ chain, transport, account });
      const forwarder = await publicClient.readContract({
        address: addresses.fx,
        abi: fxRateReceiverAbi,
        functionName: "forwarder",
      });

      if (!isAddressEqual(forwarder, account.address)) {
        console.warn(`rate refresher stopped: FxRateReceiver forwarder is ${forwarder}, not the relayer`);
        return;
      }

      let tickRunning = false;
      const tick = async () => {
        if (tickRunning) return;
        tickRunning = true;
        try {
          const [, updatedAt] = await publicClient.readContract({
            address: addresses.fx,
            abi: fxRateReceiverAbi,
            functionName: "getRate",
            args: [stringToHex("INR", { size: 32 })],
          });
          const rateAge = Math.floor(Date.now() / 1000) - Number(updatedAt);
          if (rateAge < REFRESH_AFTER_SECONDS) {
            console.log(`rate refresher skipped: INR rate is ${rateAge}s old`);
            return;
          }

          const { frankfurter, erApi } = await fetchRates();
          const currencies: Hex[] = [];
          const values: bigint[] = [];
          const sources: number[] = [];

          for (const currency of ["INR", "MXN", "PHP"]) {
            const first = frankfurter[currency];
            const second = erApi[currency];
            if (!validRate(first) || !validRate(second)) {
              throw new Error(`rate source omitted ${currency}`);
            }
            const differenceBps = (Math.abs(first - second) / ((first + second) / 2)) * 10_000;
            if (differenceBps > 100) {
              console.warn(`rate refresher skipped ${currency}: sources differ by ${differenceBps.toFixed(1)} bps`);
              continue;
            }
            currencies.push(stringToHex(currency, { size: 32 }));
            values.push(BigInt(Math.round(((first + second) / 2) * 1e8)));
            sources.push(2);
          }

          const ngn = erApi.NGN;
          if (!validRate(ngn)) throw new Error("rate source omitted NGN");
          currencies.push(stringToHex("NGN", { size: 32 }));
          values.push(BigInt(Math.round(ngn * 1e8)));
          sources.push(1);

          const report = encodeAbiParameters(
            [{ type: "bytes32[]" }, { type: "uint256[]" }, { type: "uint8[]" }, { type: "uint64" }],
            [currencies, values, sources, BigInt(Math.floor(Date.now() / 1000))],
          );
          const hash = await walletClient.writeContract({
            address: addresses.fx,
            abi: fxRateReceiverAbi,
            functionName: "onReport",
            args: ["0x", report],
          });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`rate transaction reverted: ${hash}`);
          console.log(`rates pushed ${hash}`);
        } catch (error) {
          console.error("rate refresher tick failed", error);
        } finally {
          tickRunning = false;
        }
      };

      void tick();
      setInterval(() => void tick(), REFRESH_INTERVAL_MS);
    } catch (error) {
      console.error("rate refresher failed to start", error);
    }
  })();
}
