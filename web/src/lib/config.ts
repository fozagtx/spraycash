import { defineChain, type Address } from "viem";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";

export const chain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 10143),
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

export const rateSources = {
  frankfurter: "https://api.frankfurter.dev/v1/latest?from=USD&to=INR,MXN,PHP",
  erApi: "https://open.er-api.com/v6/latest/USD",
};

const zero = "0x0000000000000000000000000000000000000000" as Address;

/** Monad testnet deployment (contracts/deployments/monadTestnet.json). Env vars override it for local chains. */
const monadTestnet = {
  payroll: "0x60a281101208e007dbdb0b90dae3f90ef214b962",
  fx: "0x1331ded23217632b318b828040318ec510857a93",
  usd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  forwarder: "0x29bde2292814d1e7df7ceb4af39f3d8cd3f8bae9",
  ausdFaucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
} as const;

const deployed = chain.id === 10143 ? monadTestnet : null;

export const addresses = {
  payroll: (process.env.NEXT_PUBLIC_PAYROLL_ADDRESS || deployed?.payroll || zero) as Address,
  fx: (process.env.NEXT_PUBLIC_FX_ADDRESS || deployed?.fx || zero) as Address,
  usd: (process.env.NEXT_PUBLIC_USD_ADDRESS || deployed?.usd || zero) as Address,
  forwarder: (process.env.NEXT_PUBLIC_FORWARDER_ADDRESS || deployed?.forwarder || zero) as Address,
};

/** Agora's AUSD faucet on Monad testnet. When set, "Add funds" requests real test AUSD from it. */
export const ausdFaucet = (process.env.NEXT_PUBLIC_AUSD_FAUCET_ADDRESS || deployed?.ausdFaucet || "") as Address | "";

export const isConfigured = Object.values(addresses).every((a) => a !== zero);

export const explorerTx = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (address: string) => `${chain.blockExplorers.default.url}/address/${address}`;

/** Envio HyperIndex GraphQL endpoint for payslip history. Empty until the hosted indexer is deployed. */
export const indexerUrl = chain.id === 31337 ? "http://127.0.0.1:8080/v1/graphql" : "";
