"use client";

// Passkey accounts via Mera (Monad Foundation / Category Labs).
//
// One passkey yields one 32-byte PRF secret. From it we derive separate signing keys with HKDF:
//   - "employer"                 -> the employer's payroll account
//   - "client:<employer address>" -> a freelancer's account for that one client
// so a freelancer with three clients has three separate accounts behind one Face ID.
// The PRF secret lives only in memory for this tab; addresses (public) are cached for display.
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { getAddress, type Address, type LocalAccount } from "viem";

const CREDENTIAL_KEY = "payday.credential";
const HKDF_SALT = utf8ToBytes("payday.accounts.v1");

let prfSecret: Uint8Array | null = null;
const accounts = new Map<string, LocalAccount>();

export type AccountScope = { kind: "employer" } | { kind: "client"; employer: Address };

const scopeInfo = (scope: AccountScope) =>
  scope.kind === "employer" ? "employer" : `client:${scope.employer.toLowerCase()}`;

function rpInfo() {
  return { id: window.location.hostname, name: "Payday" };
}

function storedCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    return raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : undefined;
  } catch {
    return undefined;
  }
}

export function hasStoredPasskey() {
  return storedCredential() !== undefined;
}

export function isUnlocked() {
  return prfSecret !== null;
}

/** Creates a new passkey on this device (Face ID / fingerprint) and unlocks it. */
export async function createPasskey(displayName: string) {
  const result = await createPasskeyWithPrfOutput({
    rp: rpInfo(),
    user: { name: displayName || "Payday account", displayName: displayName || "Payday account" },
  });
  const { credentialId, transports } = result;
  try {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ credentialId, ...(transports ? { transports } : {}) }));
  } catch {
    // Private mode: the passkey still works, the browser just won't pre-select it next time.
  }
  setSecret(result.prfOutput);
}

/** Uses an existing passkey. With no stored hint the browser offers every Payday passkey on the device. */
export async function unlockPasskey() {
  const credential = storedCredential();
  const result = await getPasskeyPrfOutput({ rpId: rpInfo().id, ...(credential ? { credential } : {}) });
  if (!credential) {
    try {
      localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ credentialId: result.credentialId }));
    } catch {}
  }
  setSecret(result.prfOutput);
}

/** Unlocks if needed: reuses the passkey when one is known, otherwise creates one. */
export async function ensureUnlocked(displayName: string) {
  if (prfSecret) return;
  if (hasStoredPasskey()) await unlockPasskey();
  else await createPasskey(displayName);
}

function setSecret(secret: Uint8Array) {
  prfSecret?.fill(0);
  prfSecret = new Uint8Array(secret);
  accounts.clear();
}

export function lock() {
  prfSecret?.fill(0);
  prfSecret = null;
  accounts.clear();
}

/** Returns the signing account for a scope. Requires an unlocked passkey. */
export function getAccount(scope: AccountScope): LocalAccount {
  if (!prfSecret) throw new Error("Passkey is locked");
  const info = scopeInfo(scope);
  const cached = accounts.get(info);
  if (cached) return cached;
  const privateKey = hkdf(sha256, prfSecret, HKDF_SALT, utf8ToBytes(info), 32);
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  const account = toViemAccount(session);
  accounts.set(info, account);
  rememberAddress(scope, account.address);
  return account;
}

// ------------------------------------------------------------ public address cache

const ADDRESSES_KEY = "payday.addresses";

function readAddresses(): Record<string, Address> {
  try {
    return JSON.parse(localStorage.getItem(ADDRESSES_KEY) || "{}");
  } catch {
    return {};
  }
}

function rememberAddress(scope: AccountScope, address: Address) {
  try {
    const all = readAddresses();
    all[scopeInfo(scope)] = getAddress(address);
    localStorage.setItem(ADDRESSES_KEY, JSON.stringify(all));
  } catch {}
}

/** Address previously derived for a scope on this device, without prompting for the passkey. */
export function knownAddress(scope: AccountScope): Address | undefined {
  return readAddresses()[scopeInfo(scope)];
}

/** Every client account this device has derived: [employer address, freelancer account address]. */
export function knownClientAccounts(): { employer: Address; account: Address }[] {
  return Object.entries(readAddresses())
    .filter(([k]) => k.startsWith("client:"))
    .map(([k, account]) => ({ employer: getAddress(k.slice("client:".length)), account }));
}

export function passkeyErrorMessage(error: unknown): string {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") {
      return "This browser or device can't create a Payday passkey yet. Try Chrome or Safari on a recent phone or laptop.";
    }
    if (error.code === "PASSKEY_OPERATION_FAILED") return "Passkey request was cancelled or timed out. Try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong with your passkey.";
}
