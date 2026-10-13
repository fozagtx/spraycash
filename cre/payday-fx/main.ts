// Payday FX workflow (Chainlink CRE).
//
// Every minute: fetch USD->INR/MXN/PHP/NGN from two independent public sources, take the median,
// reject any currency whose sources disagree by more than 1%, and write the surviving rates to the
// FxRateReceiver on Monad testnet as a signed CRE report. PaydayPayroll refuses to lock a rate that
// is older than 10 minutes, so if this loop stops, new payslips stop too.
import {
  ConsensusAggregationByFields,
  cre,
  type CronPayload,
  type HTTPSendRequester,
  median,
  ok,
  prepareReportRequest,
  Runner,
  type Runtime,
  json,
  getNetwork,
  TxStatus,
  bytesToHex,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, stringToHex, type Hex } from "viem";
import { z } from "zod";
import { aggregate, parseRates, type SourceRates } from "./fx";

const configSchema = z.object({
  schedule: z.string(),
  currencies: z.array(z.string().length(3)),
  singleSourceAllowed: z.array(z.string()),
  maxDeviationBps: z.number().int().positive(),
  sources: z.object({ frankfurter: z.string().url(), erApi: z.string().url() }),
  evm: z.object({
    chainSelectorName: z.string(),
    receiverAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    gasLimit: z.string(),
  }),
});

type Config = z.infer<typeof configSchema>;

/** Per node: one flat record so DON consensus can take the median of every field. */
type NodeObservation = Record<string, number>;

const fetchJson = (sendRequester: HTTPSendRequester, url: string): unknown => {
  const response = sendRequester.sendRequest({ url, method: "GET" }).result();
  if (!ok(response)) throw new Error(`GET ${url} failed with status ${response.statusCode}`);
  return json(response);
};

const observe = (sendRequester: HTTPSendRequester, config: Config): NodeObservation => {
  const sources: SourceRates[] = [];
  for (const url of [config.sources.frankfurter, config.sources.erApi]) {
    try {
      sources.push(parseRates(fetchJson(sendRequester, url), config.currencies));
    } catch {
      // A source being down is handled by aggregate(): the currency drops to single-source or is rejected.
      sources.push({});
    }
  }
  const results = aggregate(sources, config.currencies, config.maxDeviationBps, config.singleSourceAllowed);
  const observation: NodeObservation = {};
  for (const r of results) {
    observation[r.currency] = r.status === "ok" ? r.scaled : 0;
    observation[`${r.currency}_sources`] = r.status === "ok" ? r.sources : 0;
  }
  return observation;
};

const onCron = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const config = runtime.config;
  const fields = Object.fromEntries(
    config.currencies.flatMap((c) => [
      [c, median<number>],
      [`${c}_sources`, median<number>],
    ]),
  );

  const http = new cre.capabilities.HTTPClient();
  const agreed = http
    .sendRequest(runtime, observe, ConsensusAggregationByFields<NodeObservation, NodeObservation>(fields))(config)
    .result();

  const currencies: Hex[] = [];
  const values: bigint[] = [];
  const sourceCounts: number[] = [];
  for (const c of config.currencies) {
    const scaled = agreed[c];
    if (!scaled) {
      runtime.log(`${c}: rejected (sources missing or disagree by more than ${config.maxDeviationBps / 100}%)`);
      continue;
    }
    currencies.push(stringToHex(c, { size: 32 }));
    values.push(BigInt(Math.round(scaled)));
    sourceCounts.push(Math.round(agreed[`${c}_sources`]));
    runtime.log(`${c}: ${(scaled / 1e8).toFixed(4)} from ${Math.round(agreed[`${c}_sources`])} source(s)`);
  }
  if (currencies.length === 0) return "no rates passed validation; nothing written";

  const observedAt = BigInt(Math.floor(runtime.now().getTime() / 1000));
  const payload = encodeAbiParameters(
    [{ type: "bytes32[]" }, { type: "uint256[]" }, { type: "uint8[]" }, { type: "uint64" }],
    [currencies, values, sourceCounts, observedAt],
  );

  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.evm.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`Unknown chain ${config.evm.chainSelectorName}`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);

  const report = runtime.report(prepareReportRequest(payload)).result();
  const reply = evm
    .writeReport(runtime, {
      receiver: config.evm.receiverAddress,
      report,
      gasConfig: { gasLimit: config.evm.gasLimit },
    })
    .result();

  if (reply.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`writeReport failed: ${reply.errorMessage ?? TxStatus[reply.txStatus]}`);
  }
  const txHash = reply.txHash ? bytesToHex(reply.txHash) : "unknown";
  runtime.log(`Wrote ${currencies.length} rate(s) to ${config.evm.receiverAddress} in tx ${txHash}`);
  return txHash;
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
