import hre from "hardhat";
import fs from "fs";
import path from "path";
import { getAddress } from "viem";

// Deploys the full Spraycash stack and writes addresses to deployments/<network>.json.
//
// CRE_FORWARDER_ADDRESS: the Chainlink CRE forwarder allowed to write FX reports.
//   For `cre workflow simulate --broadcast` use the MockKeystoneForwarder for Monad testnet
//   (see the CRE forwarder directory). Defaults to the deployer so you can push rates by hand.
async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const creForwarder = getAddress(process.env.CRE_FORWARDER_ADDRESS ?? deployer.account.address);

  console.log(`Deployer:       ${deployer.account.address}`);
  console.log(`CRE forwarder:  ${creForwarder}`);

  const forwarder = await hre.viem.deployContract("SpraycashForwarder");
  console.log(`SpraycashForwarder ${forwarder.address}`);
  const usd = await hre.viem.deployContract("SpraycashUSD", [forwarder.address]);
  console.log(`SpraycashUSD       ${usd.address}`);
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
