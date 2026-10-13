"use client";

import type { Address, Hex, LocalAccount } from "viem";
import { spraycashForwarderAbi } from "./abi";
import { chainNow, publicClient } from "./chain";
import { addresses, chain } from "./config";

export const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

export class RelayError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * Signs `data` for `to` with the passkey account and asks the Spraycash relayer to submit it.
 * The person never needs a balance for fees; the relayer pays, but can't change what was signed.
 */
export async function sendGasless(account: LocalAccount, to: Address, data: Hex, gas = 600_000n): Promise<Hex> {
  const nonce = await publicClient.readContract({
    address: addresses.forwarder,
    abi: spraycashForwarderAbi,
    functionName: "nonces",
    args: [account.address],
  });
  const deadline = Math.floor(chainNow()) + 10 * 60;
  const message = { from: account.address, to, value: 0n, gas, nonce, deadline, data };
  const signature = await account.signTypedData!({
    domain: { name: "SpraycashForwarder", version: "1", chainId: chain.id, verifyingContract: addresses.forwarder },
    types: FORWARD_REQUEST_TYPES,
    primaryType: "ForwardRequest",
    message,
  });

  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request: {
        from: account.address,
        to,
        value: "0",
        gas: gas.toString(),
        deadline,
        data,
        signature,
      },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { hash?: Hex; error?: string; code?: string };
  if (!res.ok || !body.hash) throw new RelayError(body.error || "Couldn't send that. Try again.", body.code);
  return body.hash;
}
