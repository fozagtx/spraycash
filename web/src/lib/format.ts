import { CURRENCIES, type CurrencyCode } from "./currencies";

export const USD_DECIMALS = 6;
export const RATE_DECIMALS = 8;

/** 6-decimal USD bigint -> number of dollars. */
export const usdToNumber = (v: bigint) => Number(v) / 10 ** USD_DECIMALS;
export const rateToNumber = (v: bigint) => Number(v) / 10 ** RATE_DECIMALS;

export function formatUsd(dollars: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(dollars);
}

export function formatLocal(amount: number, code: CurrencyCode, digits = 2) {
  return new Intl.NumberFormat(CURRENCIES[code].locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatRate(rate: number) {
  return rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function ago(seconds: number) {
  if (seconds < 0) seconds = 0;
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function shortHash(h: string) {
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
