import hre from "hardhat";
import fs from "fs";
import path from "path";
import { encodeAbiParameters, stringToHex, type Hex } from "viem";

// Manual FX write for local dev or emergencies. Works only when the deployer is the
// receiver's forwarder (CRE_FORWARDER_ADDRESS unset at deploy). Production writes come from CRE.
// Usage: RATES="INR=83.42,MXN=18.31" npx hardhat run scripts/push-rate.ts --network <net>
async function main() {
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", `${hre.network.name}.json`), "utf8"),
  );
  const fx = await hre.viem.getContractAt("FxRateReceiver", deployment.fx);
  const pairs = (process.env.RATES ?? "INR=83.42,MXN=18.31,PHP=56.12,NGN=1530.5").split(",");
  const currencies: Hex[] = [];
  const values: bigint[] = [];
  const sources: number[] = [];
  for (const pair of pairs) {
    const [code, rate] = pair.split("=");
    currencies.push(stringToHex(code.trim(), { size: 32 }));
    values.push(BigInt(Math.round(Number(rate) * 1e8)));
    sources.push(1);
  }
  const report = encodeAbiParameters(
    [{ type: "bytes32[]" }, { type: "uint256[]" }, { type: "uint8[]" }, { type: "uint64" }],
    [currencies, values, sources, BigInt(Math.floor(Date.now() / 1000))],
  );
  const hash = await fx.write.onReport(["0x", report]);
  console.log(`Pushed ${pairs.join(", ")} in ${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
