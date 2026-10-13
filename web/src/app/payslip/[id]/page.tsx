"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress } from "viem";
import { spraycashPayrollAbi } from "@/lib/abi";
import { chainNow, earnedAt, payslipStatus, readPayslip, ZERO_ADDRESS, type Payslip } from "@/lib/chain";
import { addresses, isConfigured } from "@/lib/config";
import { currencyFromKey } from "@/lib/currencies";
import { formatDate, formatLocal, formatUsd, rateToNumber, shortHash, usdToNumber } from "@/lib/format";
import { passkeyErrorMessage } from "@/lib/passkey";
import { sendGasless } from "@/lib/relay";
import { clientName, receiptsFor, rememberReceipt } from "@/lib/store";
import { usePasskeyAccount } from "@/lib/useAccount";
import { HeroAmount } from "@/components/HeroAmount";
import { Flag, LiveDot, NotConfigured, Spinner, useFrameNow } from "@/components/ui";

export default function PayslipPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const router = useRouter();
  const id = useMemo(() => {
    try {
      return BigInt(idParam);
    } catch {
      return null;
    }
  }, [idParam]);
  const [payslip, setPayslip] = useState<Payslip | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipts, setReceipts] = useState<string[]>([]);
  const scope = payslip ? ({ kind: "client", employer: getAddress(payslip.employer) } as const) : null;
  const acct = usePasskeyAccount(scope);

  const load = useCallback(async () => {
    if (id === null) return setPayslip(null);
    try {
      setPayslip(await readPayslip(id));
    } catch {
      setPayslip(null);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (id !== null) setReceipts(receiptsFor(id));
  }, [id]);

  const status = payslip ? payslipStatus(payslip, chainNow()) : undefined;
  const now = useFrameNow(status !== "stopped" && status !== "complete" && status !== "refunded");

  if (!isConfigured) {
    return (
      <div className="narrow page">
        <NotConfigured />
      </div>
    );
  }
  if (payslip === undefined) {
    return (
      <div className="narrow page" style={{ display: "flex", gap: 10 }}>
        <Spinner /> <span className="muted">Loading your pay…</span>
      </div>
    );
  }
  const currency = payslip ? currencyFromKey(payslip.currency) : undefined;
  if (!payslip || !currency) {
    return (
      <div className="narrow page card">
        <p style={{ margin: 0 }}>We couldn&apos;t find that payslip.</p>
      </div>
    );
  }

  const p = payslip;
  const rate = rateToNumber(p.lockedRate);
  const earnedUsd = p.voided ? 0 : earnedAt(p, now);
  const withdrawnUsd = usdToNumber(p.withdrawn);
  const availableUsd = Math.max(0, earnedUsd - withdrawnUsd);
  const durationDays = Number(p.end - p.start) / 86400;
  const monthlyLocal = (usdToNumber(p.deposit) / durationDays) * 30 * rate;
  const from = clientName(getAddress(p.employer)) || "Your client";
  const unclaimed = p.freelancer === ZERO_ADDRESS;
  const isMine = !!acct.address && !unclaimed && getAddress(acct.address) === getAddress(p.freelancer);

  async function withdraw() {
    setBusy(true);
    setError(undefined);
    try {
      const hash = await acct.withAccount(async (account) => {
        if (getAddress(account.address) !== getAddress(p.freelancer)) {
          throw new Error("This payslip belongs to a different account. Open your pay link on the device you used.");
        }
        return sendGasless(
          account,
          addresses.payroll,
          encodeFunctionData({ abi: spraycashPayrollAbi, functionName: "withdraw", args: [p.id] }),
        );
      });
      rememberReceipt(p.id, hash);
      router.push(`/receipt/${hash}`);
    } catch (e) {
      setError(passkeyErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="narrow page stack-lg">
      <div className="card card-hero stack-lg">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span className="person">
            <Flag code={currency.code} large />
            <span>
              <strong>{from}</strong>
              <div className="small muted">Payslip #{p.id.toString()}</div>
            </span>
          </span>
          {status === "streaming" ? (
            <LiveDot />
          ) : (
            <LiveDot off label={status === "stopped" ? "Pay stopped" : status === "complete" ? "Paid in full" : status === "scheduled" ? "Starts soon" : "Not running"} />
          )}
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <span className="small muted">Ready to withdraw</span>
          <HeroAmount amount={availableUsd * rate} code={currency.code} />
          <span className="small muted">
            ≈ {formatUsd(availableUsd, availableUsd < 1 ? 4 : 2)} AUSD · rate locked {rate.toFixed(2)}
          </span>
        </div>

        {status === "stopped" && (
          <div className="notice notice-warning">
            {from} stopped pay on {formatDate(Number(p.stoppedAt))}. Everything you earned until then is yours to keep.
          </div>
        )}
        {error && <div className="notice notice-danger">{error}</div>}

        <button className="btn btn-accent btn-block" onClick={withdraw} disabled={busy || availableUsd <= 0 || unclaimed}>
          {busy ? (
            <>
              <Spinner /> Withdrawing…
            </>
          ) : (
            `Withdraw ${formatLocal(availableUsd * rate, currency.code)}`
          )}
        </button>
        {!isMine && !unclaimed && acct.ready && (
          <p className="small muted" style={{ margin: 0 }}>
            Withdrawing asks for your passkey to confirm it&apos;s you.
          </p>
        )}
        {unclaimed && (
          <p className="small muted" style={{ margin: 0 }}>
            This payslip hasn&apos;t been connected to an account yet. Open the pay link you were sent.
          </p>
        )}
      </div>

      <div className="card stack" style={{ gap: 0 }}>
        <div className="kv">
          <span>Earned so far</span>
          <span>{formatLocal(earnedUsd * rate, currency.code)}</span>
        </div>
        <div className="kv">
          <span>Already withdrawn</span>
          <span>{formatLocal(withdrawnUsd * rate, currency.code)}</span>
        </div>
        <div className="kv">
          <span>Monthly pay</span>
          <span>{formatLocal(monthlyLocal, currency.code, 0)}</span>
        </div>
        <div className="kv">
          <span>Per day</span>
          <span>{formatLocal(monthlyLocal / 30, currency.code)}</span>
        </div>
        <div className="kv">
          <span>Funded through</span>
          <span>{formatDate(Number(p.end))}</span>
        </div>
      </div>

      {receipts.length > 0 && (
        <div className="card stack" style={{ gap: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Receipts
          </div>
          {receipts.map((h) => (
            <Link key={h} href={`/receipt/${h}`} className="kv" style={{ textDecoration: "none" }}>
              <span>Withdrawal</span>
              <span className="mono">{shortHash(h)} →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
