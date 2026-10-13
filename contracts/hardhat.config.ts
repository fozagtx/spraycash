import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-viem";
import path from "path";

const SOLC_VERSION = "0.8.28";

// Use the bundled solc-js build so compiling works offline / behind strict proxies.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion !== SOLC_VERSION) return runSuper();
  const solcPkg = path.dirname(require.resolve("solc/package.json"));
  return {
    compilerPath: path.join(solcPkg, "soljson.js"),
    isSolcJs: true,
    version: SOLC_VERSION,
    longVersion: require("solc/package.json").version,
  };
});

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" },
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
};

export default config;
