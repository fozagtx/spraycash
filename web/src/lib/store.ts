"use client";

// Off-chain details only the employer's device needs: names and claim links.
// Money, rates and status always come from the contracts.
import type { Address } from "viem";

export type PayslipMeta = {
  name: string;
  country: string;
  monthlyLocal: number;
  link: string;
};

const META_KEY = "payday.payslipMeta";
const BUSINESS_KEY = "payday.businessName";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function savePayslipMeta(payroll: Address, id: bigint, meta: PayslipMeta) {
  const all = read<Record<string, PayslipMeta>>(META_KEY, {});
  all[`${payroll.toLowerCase()}:${id}`] = meta;
  write(META_KEY, all);
}

export function getPayslipMeta(payroll: Address, id: bigint): PayslipMeta | undefined {
  return read<Record<string, PayslipMeta>>(META_KEY, {})[`${payroll.toLowerCase()}:${id}`];
}

export function getBusinessName() {
  return read<string>(BUSINESS_KEY, "");
}

export function setBusinessName(name: string) {
  write(BUSINESS_KEY, name);
}

/** Who a freelancer's client accounts belong to, for the "My pay" page. */
const CLIENT_NAMES_KEY = "payday.clientNames";
export function rememberClientName(employer: Address, name: string) {
  const all = read<Record<string, string>>(CLIENT_NAMES_KEY, {});
  all[employer.toLowerCase()] = name;
  write(CLIENT_NAMES_KEY, all);
}
export function clientName(employer: Address) {
  return read<Record<string, string>>(CLIENT_NAMES_KEY, {})[employer.toLowerCase()];
}

/** Withdrawal receipts this device made, newest first. */
const RECEIPTS_KEY = "payday.receipts";
export function rememberReceipt(id: bigint, hash: string) {
  const all = read<Record<string, string[]>>(RECEIPTS_KEY, {});
  const key = id.toString();
  all[key] = [hash, ...(all[key] ?? []).filter((h) => h !== hash)].slice(0, 20);
  write(RECEIPTS_KEY, all);
}
export function receiptsFor(id: bigint): string[] {
  return read<Record<string, string[]>>(RECEIPTS_KEY, {})[id.toString()] ?? [];
}
