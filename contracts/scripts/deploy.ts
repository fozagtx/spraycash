import hre from "hardhat";
import fs from "fs";
import path from "path";
import { erc20Abi, getAddress, type Address } from "viem";

// Agora AUSD on Monad testnet (docs.agora.finance/developer/contract-deployments).
const AUSD_MONAD_TESTNET = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const AUSD_FAUCET_MONAD_TESTNET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";

// Deploys the full Spraycash stack and writes addresses to deployments/<network>.json.
//
// CRE_FORWARDER_ADDRESS: the Chainlink CRE forwarder allowed to write FX reports.
//   For `cre workflow simulate --broadcast` use the MockKeystoneForwarder for Monad testnet
//   (see the CRE forwarder directory). Defaults to the deployer so you can push rates by hand.
// USD_TOKEN: the dollar the payroll escrows. On monadTestnet this defaults to Agora's AUSD;
//   set USD_TOKEN=demo to deploy the SpraycashUSD stand-in instead. Locally the stand-in is always used.
async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const creForwarder = getAddress(process.env.CRE_FORWARDER_ADDRESS ?? deployer.account.address);

  console.log(`Deployer:       ${deployer.account.address}`);
  console.log(`CRE forwarder:  ${creForwarder}`);

  const forwarder = await hre.viem.deployContract("SpraycashForwarder");
  console.log(`SpraycashForwarder ${forwarder.address}`);
  const wantsAusd = hre.network.name === "monadTestnet" && process.env.USD_TOKEN !== "demo";
  let usdAddress: Address;
  let ausdFaucet: Address | null = null;
  if (process.env.USD_TOKEN && process.env.USD_TOKEN !== "demo") {
    usdAddress = getAddress(process.env.USD_TOKEN);
  } else if (wantsAusd) {
    usdAddress = AUSD_MONAD_TESTNET;
    ausdFaucet = AUSD_FAUCET_MONAD_TESTNET;
  } else {
    usdAddress = (await hre.viem.deployContract("SpraycashUSD", [forwarder.address])).address;
  }
  if (process.env.USD_TOKEN || wantsAusd) {
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({ address: usdAddress, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address: usdAddress, abi: erc20Abi, functionName: "decimals" }),
    ]);
    if (decimals !== 6) throw new Error(`${symbol} has ${decimals} decimals; Spraycash expects 6`);
    console.log(`Dollar token    ${usdAddress} (${symbol}, existing)`);
  } else {
    console.log(`SpraycashUSD    ${usdAddress} (local stand-in)`);
  }
  const usd = { address: usdAddress };
  const fx = await hre.viem.deployContract("FxRateReceiver", [creForwarder]);
  console.log(`FxRateReceiver  ${fx.address}`);
  const payroll = await hre.viem.deployContract("SpraycashPayroll", [usd.address, fx.address, forwarder.address]);
  console.log(`SpraycashPayroll   ${payroll.address}`);

  const out = {
    chainId: await publicClient.getChainId(),
    startBlock: Number(await publicClient.getBlockNumber()),
    creForwarder,
    forwarder: forwarder.address,
    usd: usd.address,
    ausdFaucet,
    fx: fx.address,
    payroll: payroll.address,
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hre.network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
