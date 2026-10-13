"use client";

import { useEffect, useState } from "react";
import { chainNow } from "@/lib/chain";
import { CURRENCIES, type CurrencyCode } from "@/lib/currencies";

export function Flag({ code, large }: { code: CurrencyCode; large?: boolean }) {
  return (
    <span
      className={`flag${large ? " flag-lg" : ""}`}
      style={{ background: CURRENCIES[code].flag }}
      role="img"
      aria-label={CURRENCIES[code].country}
    />
  );
}

export function CurrencyChip({ code }: { code: CurrencyCode }) {
  return (
    <span className="chip">
      <Flag code={code} />
      {code}
    </span>
  );
}

export function LiveDot({ label = "Paid every second", off }: { label?: string; off?: boolean }) {
  return (
    <span className="live" style={off ? { color: "var(--muted)" } : undefined}>
      <span className={`live-dot${off ? " off" : ""}`} aria-hidden />
      {label}
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

/** Current unix time in seconds (fractional), refreshed every `intervalMs`. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => chainNow());
  useEffect(() => {
    const t = setInterval(() => setNow(chainNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Smooth per-frame clock for the ticking hero number. */
export function useFrameNow(active = true) {
  const [now, setNow] = useState(() => chainNow());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      // ~20 fps is plenty for a ticking number and kind to phone batteries.
      if (t - last > 50) {
        setNow(chainNow());
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  return <span className="avatar">{initials || "?"}</span>;
}

export function NotConfigured() {
  return (
    <div className="notice notice-warning">
      Spraycash isn&apos;t connected yet. Set the contract addresses in <span className="mono">web/.env.local</span>{" "}
      (see the README).
    </div>
  );
}

export function ChainlinkLogo({ size = 14 }: { size?: number }) {
  return (
    <svg className="chainlink-logo" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Chainlink">
      <path
        fill="#375BD2"
        d="M12 0L9.798 1.266l-6 3.468L1.596 6v12l2.202 1.266 6.055 3.468L12.055 24l2.202-1.266 5.945-3.468L22.404 18V6l-2.202-1.266-6-3.468zM6 15.468V8.532l6-3.468 6 3.468v6.936l-6 3.468z"
      />
    </svg>
  );
}
