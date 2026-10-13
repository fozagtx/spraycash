"use client";

import { useEffect, useState } from "react";
import { formatLocal, formatUsd } from "@/lib/format";
import { HeroAmount } from "./HeroAmount";
import { Flag, LiveDot, useFrameNow } from "./ui";

// Illustrative payslip on the landing page (₹1,25,000/month at 83.42). Not live data.
const MONTHLY_INR = 125000;
const RATE = 83.42;
const PER_SECOND = MONTHLY_INR / (30 * 24 * 3600);

export function LandingDemo() {
  const now = useFrameNow();
  // The number depends on the clock, so render it only in the browser to keep hydration stable.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const base = 9 * 24 * 3600 + 3 * 3600; // nine days into the month
  const elapsed = base + (mounted ? now % 100000 : 0);
  const inr = elapsed * PER_SECOND;
  return (
    <div className="demo-wrap">
    <div className="card card-hero stack" aria-label="Example payslip" style={{ paddingBottom: 64 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="person">
          <Flag code="INR" large />
          <span>
            <strong>Priya Raman</strong>
            <div className="small muted">Paid by Acme Studio</div>
          </span>
        </span>
        <LiveDot label="Live" />
      </div>
      <HeroAmount amount={inr} code="INR" />
      <div className="small muted">
        ≈ {formatUsd(inr / RATE)} USD · rate locked {RATE}
      </div>
      <hr className="divider" style={{ margin: "8px 0" }} />
      <div className="kv">
        <span>Monthly pay</span>
        <span>{formatLocal(MONTHLY_INR, "INR", 0)}</span>
      </div>
      <div className="kv">
        <span>Per day</span>
        <span>{formatLocal(MONTHLY_INR / 30, "INR")}</span>
      </div>
    </div>
      <div className="float-quote" aria-hidden>
        <span className="chip chip-verified" style={{ justifySelf: "start" }}>✓ Verified by Chainlink</span>
        <span>
          <strong>1 USD = {RATE} INR</strong> <span className="muted">· locked</span>
        </span>
      </div>
    </div>
  );
}
