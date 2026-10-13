"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { spraycashPayrollAbi, spraycashUSDAbi } from "@/lib/abi";
import {
  earnedAt,
  payslipStatus,
  readEmployerPayslipIds,
  readPayslips,
  readUsdBalance,
  type Payslip,
  type PayslipStatus,
} from "@/lib/chain";
import { addresses, ausdFaucet, isConfigured } from "@/lib/config";
import { currencyFromKey } from "@/lib/currencies";
import { formatLocal, formatUsd, rateToNumber, usdToNumber } from "@/lib/format";
import { sendGasless } from "@/lib/relay";
import { getBusinessName, getPayslipMeta, setBusinessName } from "@/lib/store";
import { usePasskeyAccount } from "@/lib/useAccount";
import { SignInCard } from "@/components/SignInCard";
import { Avatar, CurrencyChip, LiveDot, NotConfigured, Spinner, useNow } from "@/components/ui";
import { ConfirmButton, CopyButton, Odometer, Skeleton, useToast } from "@/components/Motion";
import { Tour, type TourStep } from "@/components/Tour";

const PAYROLL_TOUR: TourStep[] = [
  { target: "balance", title: "Your payroll balance", body: "Add funds here first. Every payslip is paid from this balance." },
  { target: "pay", title: "Pay a freelancer", body: "Pick who, where they live and how much. It takes a minute." },
  { target: "paying", title: "Paying out now", body: "How much your team earns per day, live." },
  { target: "list", title: "Everyone you pay", body: "Copy a pay link, or stop pay any time. Unearned pay comes back to you." },
];

const EMPLOYER = { kind: "employer" } as const;

export default function EmployerPage() {
  const acct = usePasskeyAccount(EMPLOYER);
  const [business, setBusiness] = useState("");
  useEffect(() => setBusiness(getBusinessName()), []);

  if (!isConfigured) {
    return (
      <div className="container page">
        <NotConfigured />
      </div>
    );
  }
  if (!acct.ready) return null;

  if (!acct.address) {
    return (
      <div className="container page">
        <SignInCard
          title="Start paying"
          subtitle="Create a passkey for your business. You'll use it to fund payroll and approve every payslip."
          askName
          hasPasskey={false}
          busy={acct.busy}
          error={acct.error}
          onCreate={async (name) => {
            setBusinessName(name);
            setBusiness(name);
            await acct.create(name);
          }}
          onUnlock={acct.unlock}
        />
      </div>
    );
  }

  return <Dashboard business={business} acct={acct} />;
}

function Dashboard({ business, acct }: { business: string; acct: ReturnType<typeof usePasskeyAccount> }) {
  const address = acct.address!;
  const now = useNow(1000);
  const [balance, setBalance] = useState<bigint>();
  const [payslips, setPayslips] = useState<Payslip[]>();
  const [busy, setBusy] = useState<string>();
  const toast = useToast();

  const load = useCallback(async () => {
    const [bal, ids] = await Promise.all([readUsdBalance(address), readEmployerPayslipIds(address)]);
    setBalance(bal);
    const list = await readPayslips([...ids].reverse());
    setPayslips(list);
  }, [address]);

  useEffect(() => {
    load().catch(() => toast("danger", "Couldn't load payroll. Retrying…"));
    const t = setInterval(() => load().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [load, toast]);

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    try {
      const text = await fn();
      if (text) toast("ok", text);
      await load();
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(undefined);
    }
  }

  const addFunds = () =>
    act("funds", async () => {
      if (ausdFaucet) {
        // Agora's test faucet sends AUSD straight to the payroll account; no signature needed.
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error || "Couldn't add funds. Try again in a minute.");
        return "Added $10,000 in test AUSD from Agora.";
      }
      return acct.withAccount(async (a) => {
        await sendGasless(a, addresses.usd, encodeFunctionData({ abi: spraycashUSDAbi, functionName: "faucet" }));
        return "Added $25,000 in demo funds.";
      }, business);
    });

  const stop = (p: Payslip) =>
    act(`stop-${p.id}`, () =>
      acct.withAccount(async (a) => {
        await sendGasless(
          a,
          addresses.payroll,
          encodeFunctionData({ abi: spraycashPayrollAbi, functionName: "stop", args: [p.id] }),
        );
        return "Pay stopped. Earned pay stays with your freelancer; the rest is back in your balance.";
      }, business),
    );

  const refund = (p: Payslip) =>
    act(`refund-${p.id}`, () =>
      acct.withAccount(async (a) => {
        await sendGasless(
          a,
          addresses.payroll,
          encodeFunctionData({ abi: spraycashPayrollAbi, functionName: "refundUnclaimed", args: [p.id] }),
        );
        return "The link expired unused, so the full amount is back in your balance.";
      }, business),
    );

  const lowBalance = balance !== undefined && balance < 50_000_000_000n;
  const streaming = payslips?.filter((p) => payslipStatus(p, now) === "streaming") ?? [];
  const perDay = streaming.reduce((sum, p) => sum + usdToNumber(p.deposit) / ((Number(p.end) - Number(p.start)) / 86400), 0);

  return (
    <div className="container page stack-lg reveal">
      <Tour id="payroll" steps={PAYROLL_TOUR} />
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <div className="eyebrow">{business || "Your business"}</div>
          <h1 className="display" style={{ fontSize: 44 }}>
            Payroll
          </h1>
        </div>
        <Link href="/employer/new" className="btn btn-accent" data-tour="pay">
          Pay a freelancer
        </Link>
      </div>

      <div className="stats">
        <div className="card" data-tour="balance">
          <span className="small muted">Payroll balance · AUSD by Agora</span>
          <span className="money stat-value">
            {balance === undefined ? <Skeleton w={180} h={40} /> : <Odometer text={formatUsd(usdToNumber(balance))} />}
          </span>
          {lowBalance && (
            <button className="btn btn-ghost btn-sm" onClick={addFunds} disabled={busy === "funds"} style={{ justifySelf: "start" }}>
              {busy === "funds" ? <Spinner /> : null} {ausdFaucet ? "Add $10,000 test AUSD" : "Add demo funds"}
            </button>
          )}
        </div>
        <div className="card" data-tour="paying">
          <span className="small muted">Paying out now</span>
          <span className="money stat-value">
            <Odometer text={formatUsd(perDay)} />
            <span className="small muted" style={{ fontFamily: "var(--font-ui)" }}>
              {" "}
              / day
            </span>
          </span>
          <LiveDot off={streaming.length === 0} label={`${streaming.length} freelancer${streaming.length === 1 ? "" : "s"} streaming`} />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }} data-tour="list">
        {!payslips ? (
          <div style={{ padding: 24, display: "grid", gap: 18 }} aria-label="Loading payslips">
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Skeleton w={32} h={32} r={16} />
                <div style={{ display: "grid", gap: 6, flex: 1 }}>
                  <Skeleton w="40%" h={12} />
                  <Skeleton w="22%" h={10} />
                </div>
                <Skeleton w={72} h={22} r={999} />
              </div>
            ))}
          </div>
        ) : payslips.length === 0 ? (
          <div className="empty fade-in">
            <span className="empty-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
              </svg>
            </span>
            <p className="muted" style={{ margin: 0 }}>
              No one on payroll yet.
            </p>
            <Link href="/employer/new" className="btn btn-ghost btn-sm">
              Pay your first freelancer
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Freelancer</th>
                  <th>Paid so far</th>
                  <th className="hide-sm">Per day</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <PayslipRow
                    key={p.id.toString()}
                    p={p}
                    now={now}
                    busy={busy}
                    onStop={() => stop(p)}
                    onRefund={() => refund(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<PayslipStatus, { text: string; cls: string }> = {
  unclaimed: { text: "Link sent", cls: "chip" },
  expired: { text: "Link expired", cls: "chip chip-warning" },
  refunded: { text: "Refunded", cls: "chip" },
  scheduled: { text: "Starts soon", cls: "chip" },
  streaming: { text: "Streaming", cls: "chip chip-verified" },
  stopped: { text: "Stopped", cls: "chip chip-danger" },
  complete: { text: "Paid in full", cls: "chip chip-verified" },
};

function PayslipRow({
  p,
  now,
  busy,
  onStop,
  onRefund,
}: {
  p: Payslip;
  now: number;
  busy?: string;
  onStop: () => void;
  onRefund: () => void;
}) {
  const meta = getPayslipMeta(addresses.payroll, p.id);
  const currency = currencyFromKey(p.currency);
  const status = payslipStatus(p, now);
  const rate = rateToNumber(p.lockedRate);
  const earned = p.voided ? 0 : earnedAt(p, now);
  const days = (Number(p.end) - Number(p.start)) / 86400;
  const perDayUsd = usdToNumber(p.deposit) / days;
  const canStop = !p.voided && p.stoppedAt === 0n && now < Number(p.end) && status !== "expired";

  return (
    <tr>
      <td>
        <span className="person">
          <Avatar name={meta?.name ?? `#${p.id}`} />
          <span>
            <strong>{meta?.name ?? `Payslip #${p.id}`}</strong>
            <div className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {currency && <CurrencyChip code={currency.code} />}
              <span className="hide-sm">locked at {rate.toFixed(2)}</span>
            </div>
          </span>
        </span>
      </td>
      <td>
        <div>{currency ? formatLocal(earned * rate, currency.code) : formatUsd(earned)}</div>
        <div className="small muted">{formatUsd(earned)}</div>
      </td>
      <td className="hide-sm">
        <div>{currency ? formatLocal(perDayUsd * rate, currency.code, 0) : ""}</div>
        <div className="small muted">{formatUsd(perDayUsd)}</div>
      </td>
      <td>
        <span className={STATUS_LABEL[status].cls}>{STATUS_LABEL[status].text}</span>
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {status === "unclaimed" && meta?.link && (
          <CopyButton text={meta.link} className="btn btn-ghost btn-sm" />
        )}{" "}
        {status === "expired" && (
          <button className="btn btn-ghost btn-sm" onClick={onRefund} disabled={busy === `refund-${p.id}`}>
            {busy === `refund-${p.id}` ? <Spinner /> : null} Refund
          </button>
        )}
        {canStop && (
          <ConfirmButton
            label="Stop"
            question="Stop paying?"
            confirmLabel="Stop pay"
            busy={busy === `stop-${p.id}`}
            busyNode={<Spinner />}
            onConfirm={onStop}
          />
        )}
      </td>
    </tr>
  );
}
