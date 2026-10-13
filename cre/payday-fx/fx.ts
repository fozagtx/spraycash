// Pure FX aggregation logic, kept free of CRE imports so it is unit-testable with `bun test`.

export const RATE_DECIMALS = 8;
const SCALE = 10 ** RATE_DECIMALS;

export type SourceRates = Record<string, number>;

export type CurrencyResult =
  | { currency: string; status: "ok"; rate: number; scaled: number; sources: number }
  | { currency: string; status: "rejected"; reason: string };

/** Parses frankfurter.app (ECB) and open.er-api.com responses. Both put USD->X under `rates`. */
export function parseRates(body: unknown, currencies: readonly string[]): SourceRates {
  const rates = (body as { rates?: Record<string, unknown> } | null)?.rates;
  if (!rates || typeof rates !== "object") return {};
  const out: SourceRates = {};
  for (const c of currencies) {
    const v = rates[c];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[c] = v;
  }
  return out;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Spread between the highest and lowest quote, in basis points of the lowest. */
export function deviationBps(values: readonly number[]): number {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return ((hi - lo) / lo) * 10_000;
}

/**
 * Combines quotes from every source for each currency:
 * - 2+ sources: median, rejected if they disagree by more than `maxDeviationBps`.
 * - 1 source: accepted only for currencies listed in `singleSourceAllowed` (e.g. NGN, which the ECB doesn't publish).
 * - 0 sources: rejected.
 */
export function aggregate(
  sources: readonly SourceRates[],
  currencies: readonly string[],
  maxDeviationBps: number,
  singleSourceAllowed: readonly string[],
): CurrencyResult[] {
  return currencies.map((currency): CurrencyResult => {
    const quotes = sources.map((s) => s[currency]).filter((v): v is number => v !== undefined);
    if (quotes.length === 0) return { currency, status: "rejected", reason: "no source" };
    if (quotes.length === 1 && !singleSourceAllowed.includes(currency)) {
      return { currency, status: "rejected", reason: "only one source" };
    }
    if (quotes.length > 1) {
      const dev = deviationBps(quotes);
      if (dev > maxDeviationBps) {
        return { currency, status: "rejected", reason: `sources disagree by ${(dev / 100).toFixed(2)}%` };
      }
    }
    const rate = median(quotes);
    return { currency, status: "ok", rate, scaled: Math.round(rate * SCALE), sources: quotes.length };
  });
}
