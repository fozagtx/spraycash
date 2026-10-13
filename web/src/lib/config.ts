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

const zero = "0x0000000000000000000000000000000000000000" as Address;

export const addresses = {
  payroll: (process.env.NEXT_PUBLIC_PAYROLL_ADDRESS || zero) as Address,
  fx: (process.env.NEXT_PUBLIC_FX_ADDRESS || zero) as Address,
  usd: (process.env.NEXT_PUBLIC_USD_ADDRESS || zero) as Address,
  forwarder: (process.env.NEXT_PUBLIC_FORWARDER_ADDRESS || zero) as Address,
};

export const isConfigured = Object.values(addresses).every((a) => a !== zero);

export const explorerTx = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (address: string) => `${chain.blockExplorers.default.url}/address/${address}`;
