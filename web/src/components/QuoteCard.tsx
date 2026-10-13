"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findRateTx, readMaxRateAge, readQuote, type Quote } from "@/lib/chain";
import { explorerTx } from "@/lib/config";
import type { CurrencyCode } from "@/lib/currencies";
import { ago, formatRate, rateToNumber } from "@/lib/format";
import { Spinner, useNow } from "./ui";

const LOCK_SECONDS = 5;
const POLL_MS = 4000;

export type LockedQuote = Quote & { lockedUntil: number };

/**
 * Live rate from the on-chain Chainlink CRE report, with a freshness indicator and a 5-second lock.
 * While `armed`, the current quote is locked for 5 seconds and passed to `onLock`; when the lock runs
 * out it refreshes and re-locks. The contract re-checks that the locked quote is still the latest report.
 */
export function QuoteCard({
  currency,
  armed,
  onLock,
  onQuote,
}: {
  currency: CurrencyCode;
  armed: boolean;
  onLock: (quote: LockedQuote | null) => void;
  onQuote?: (quote: Quote | null, stale: boolean) => void;
}) {
  const now = useNow(250);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [maxAge, setMaxAge] = useState(600);
  const [error, setError] = useState(false);
  const [lock, setLock] = useState<LockedQuote | null>(null);
  const [rateTx, setRateTx] = useState<string>();
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;

  const refresh = useCallback(async () => {
    try {
      const q = await readQuote(currency);
      setQuote(q);
      setError(false);
      return q;
    } catch {
      setError(true);
      return null;
    }
  }, [currency]);

  useEffect(() => {
    setQuote(null);
    setLock(null);
    refresh();
    readMaxRateAge().then(setMaxAge).catch(() => {});
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!quote) return;
    findRateTx(currency, quote.updatedBlock).then(setRateTx).catch(() => setRateTx(undefined));
  }, [currency, quote?.updatedBlock]); // eslint-disable-line react-hooks/exhaustive-deps

  const unsupported = quote !== null && quote.rate === 0n;
  const age = quote ? now - Number(quote.updatedAt) : 0;
  const stale = quote !== null && !unsupported && age > maxAge;
  const usable = quote !== null && !unsupported && !stale;

  useEffect(() => {
    onQuoteRef.current?.(usable || stale ? quote : null, stale);
  }, [quote, usable, stale]);

  // Lock / re-lock cycle.
  useEffect(() => {
    if (!armed || !usable || !quote) {
      if (lock) setLock(null);
      return;
    }
    if (!lock || now >= lock.lockedUntil) {
      if (lock && now >= lock.lockedUntil) {
        // Lock ran out: refresh, then re-lock on the newest quote.
        setLock(null);
        refresh();
        return;
      }
      setLock({ ...quote, lockedUntil: now + LOCK_SECONDS });
    }
  }, [armed, usable, quote, lock, now, refresh]);

  useEffect(() => {
    onLockRef.current(lock);
  }, [lock]);

  if (error && !quote) {
    return (
      <div className="card">
        <div className="notice notice-warning">Can&apos;t reach the rate service. Retrying…</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Spinner /> <span className="muted">Getting today&apos;s rate…</span>
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="card">
        <div className="notice notice-warning">No verified rate for {currency} yet.</div>
      </div>
    );
  }

  const remaining = lock ? Math.max(0, lock.lockedUntil - now) : 0;
  const shown = lock ?? quote;

  return (
    <div className="card" aria-live="polite">
      <div className="quote">
        <div>
          <div className="eyebrow">Exchange rate</div>
          <div className="quote-rate">
            1 USD = {formatRate(rateToNumber(shown.rate))} {currency}
          </div>
          <div className="quote-meta">
            {stale ? (
              <span className="chip chip-warning">
                <Spinner /> Rate refreshing…
              </span>
            ) : (
              <span className="chip chip-verified">
                ✓ Verified by Chainlink{quote.sources < 2 ? " · single source" : ""}
              </span>
            )}
            <span className="small muted">updated {ago(age)}</span>
            {rateTx && (
              <a className="verify" href={explorerTx(rateTx)} target="_blank" rel="noreferrer">
                Verify
              </a>
            )}
          </div>
        </div>
        {!stale && <LockRing remaining={remaining} active={!!lock} />}
      </div>
      {stale && (
        <p className="small" style={{ color: "var(--warning)", marginBottom: 0 }}>
          This rate is more than {Math.round(maxAge / 60)} minutes old, so we won&apos;t lock it. Pay unlocks as soon as a
          fresh verified rate arrives.
        </p>
      )}
    </div>
  );
}

function LockRing({ remaining, active }: { remaining: number; active: boolean }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const frac = active ? remaining / LOCK_SECONDS : 0;
  return (
    <div className="lock-ring" title={active ? "Rate locked while you confirm" : "Rate locks when you review"}>
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <span className="lock-label">{active ? `${Math.ceil(remaining)}s` : "🔒"}</span>
    </div>
  );
}
