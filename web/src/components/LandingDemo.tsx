"use client";

import { formatLocal, formatUsd } from "@/lib/format";
import { Flag, LiveDot, useFrameNow } from "./ui";

// Illustrative payslip on the landing page (₹1,25,000/month at 83.42). Not live data.
const MONTHLY_INR = 125000;
const RATE = 83.42;
const PER_SECOND = MONTHLY_INR / (30 * 24 * 3600);

export function LandingDemo() {
  const now = useFrameNow();
  const base = 9 * 24 * 3600 + 3 * 3600; // nine days into the month
  const elapsed = base + (now % 100000);
  const inr = elapsed * PER_SECOND;
  return (
    <div className="card card-hero stack" aria-label="Example payslip">
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
      <div className="money" style={{ fontSize: "clamp(44px, 6vw, 64px)" }}>
        {formatLocal(inr, "INR")}
      </div>
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
  );
}
