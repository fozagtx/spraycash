"use client";

// EIP-2612 permit for the payroll's dollar (AUSD by Agora on Monad; the local stand-in in dev).
// The permit lets the employer approve and fund a payslip in one gasless request.
import { hashDomain, hexToSignature, type Address, type Hex, type LocalAccount, type TypedDataDomain } from "viem";
import { spraycashUSDAbi } from "./abi";
import { publicClient } from "./chain";
import { addresses, chain } from "./config";

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

let cachedDomain: TypedDataDomain | null = null;

/** Resolves the token's EIP-712 domain: ERC-5267 eip712Domain() first, else name() + a version matching DOMAIN_SEPARATOR(). */
async function tokenDomain(): Promise<TypedDataDomain> {
  if (cachedDomain) return cachedDomain;
  const token = addresses.usd;
  try {
    const [, name, version, chainId, verifyingContract] = await publicClient.readContract({
      address: token,
      abi: spraycashUSDAbi,
      functionName: "eip712Domain",
    });
    cachedDomain = { name, version, chainId: Number(chainId), verifyingContract };
    return cachedDomain;
  } catch {}
  const [name, separator] = await Promise.all([
    publicClient.readContract({ address: token, abi: spraycashUSDAbi, functionName: "name" }),
    publicClient.readContract({ address: token, abi: spraycashUSDAbi, functionName: "DOMAIN_SEPARATOR" }),
  ]);
  for (const version of ["1", "2"]) {
    const domain: TypedDataDomain = { name, version, chainId: chain.id, verifyingContract: token };
    const computed = hashDomain({
      domain: { name, version, chainId: BigInt(chain.id), verifyingContract: token },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
      },
    });
    if (computed === separator) return (cachedDomain = domain);
  }
  throw new Error("Couldn't prepare the payment approval. Try again.");
}

export async function signPermit(account: LocalAccount, spender: Address, value: bigint, deadline: bigint) {
  const [domain, nonce] = await Promise.all([
    tokenDomain(),
    publicClient.readContract({ address: addresses.usd, abi: spraycashUSDAbi, functionName: "nonces", args: [account.address] }),
  ]);
  const signature: Hex = await account.signTypedData!({
    domain,
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message: { owner: account.address, spender, value, nonce, deadline },
  });
  const { r, s, v, yParity } = hexToSignature(signature);
  return { deadline, v: Number(v ?? BigInt(27 + (yParity ?? 0))), r, s };
}
