"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, parseEventLogs, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { spraycashPayrollAbi, spraycashUSDAbi } from "@/lib/abi";
import { publicClient, readAllowance, readUsdBalance, type Quote } from "@/lib/chain";
import { addresses, isConfigured } from "@/lib/config";
import { CURRENCIES, CURRENCY_LIST, currencyKey, type CurrencyCode } from "@/lib/currencies";
import { formatLocal, formatUsd, rateToNumber, usdToNumber } from "@/lib/format";
import { sendGasless } from "@/lib/relay";
import { getBusinessName, savePayslipMeta } from "@/lib/store";
import { usePasskeyAccount } from "@/lib/useAccount";
import { QuoteCard, type LockedQuote } from "@/components/QuoteCard";
import { Flag, NotConfigured, Spinner } from "@/components/ui";

const EMPLOYER = { kind: "employer" } as const;
const DAY = 86400;

const PERIODS = [
  { label: "1 month", seconds: 30 * DAY },
  { label: "2 weeks", seconds: 14 * DAY },
  { label: "1 week", seconds: 7 * DAY },
  { label: "1 hour (demo)", seconds: 3600 },
];

const LINK_WINDOWS = [
  { label: "7 days", seconds: 7 * DAY },
  { label: "1 day", seconds: DAY },
  { label: "10 minutes (demo)", seconds: 600 },
];

export default function NewPayslipPage() {
  const acct = usePasskeyAccount(EMPLOYER);
  const [business, setBusiness] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("INR");
  const [amountText, setAmountText] = useState("");
  const [inUsd, setInUsd] = useState(false);
  const [period, setPeriod] = useState(PERIODS[0].seconds);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [linkWindow, setLinkWindow] = useState(LINK_WINDOWS[0].seconds);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [stale, setStale] = useState(false);
  const [lock, setLock] = useState<LockedQuote | null>(null);
  const [balance, setBalance] = useState<bigint>();
  const [step, setStep] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ id: bigint; link: string }>();
  const [copied, setCopied] = useState(false);

  useEffect(() => setBusiness(getBusinessName()), []);
  useEffect(() => {
    if (!acct.address) return;
    readUsdBalance(acct.address).then(setBalance).catch(() => {});
  }, [acct.address]);

  const rate = lock ? rateToNumber(lock.rate) : quote ? rateToNumber(quote.rate) : 0;
  const amount = Number(amountText.replace(/[^0-9.]/g, "")) || 0;
  const monthlyLocal = inUsd ? amount * rate : amount;
  const monthlyUsd = inUsd ? amount : rate ? amount / rate : 0;
  const fundUsd = monthlyUsd * (period / (30 * DAY));
  const fundUnits = BigInt(Math.round(fundUsd * 1e6));
  const overBudget = balance !== undefined && fundUnits > balance;
  const formValid = name.trim().length > 0 && amount > 0 && rate > 0;
  const armed = formValid && !overBudget && !step && !done;

  const startTs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (!startDate || startDate <= today) return 0n;
    return BigInt(Math.floor(new Date(`${startDate}T00:00:00`).getTime() / 1000));
  }, [startDate]);

  async function confirm() {
    if (!lock) return;
    const locked = lock;
    setError(undefined);
    try {
      await acct.withAccount(async (account) => {
        const amountUnits = BigInt(Math.round((inUsd ? amount : amount / rateToNumber(locked.rate)) * (period / (30 * DAY)) * 1e6));
        const bal = await readUsdBalance(account.address);
        if (bal < amountUnits) throw new Error("That's more than your payroll balance. Add funds first.");

        if ((await readAllowance(account.address)) < amountUnits) {
          setStep("Setting up your payroll balance…");
          await sendGasless(
            account,
            addresses.usd,
            encodeFunctionData({
              abi: spraycashUSDAbi,
              functionName: "approve",
              args: [addresses.payroll, 2n ** 256n - 1n],
            }),
          );
        }

        setStep("Funding payslip…");
        const claimKey = generatePrivateKey();
        const claimSigner = privateKeyToAccount(claimKey).address;
        const hash = await sendGasless(
          account,
          addresses.payroll,
          encodeFunctionData({
            abi: spraycashPayrollAbi,
            functionName: "createPayslip",
            args: [
              currencyKey(currency),
              locked.rate,
              locked.updatedAt,
              amountUnits,
              startTs,
              BigInt(period),
              claimSigner,
              BigInt(linkWindow),
            ],
          }),
          800_000n,
        );
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const [created] = parseEventLogs({ abi: spraycashPayrollAbi, logs: receipt.logs, eventName: "PayslipCreated" });
        if (!created) throw new Error("Payslip created, but we couldn't read it back. Check your payroll.");
        const id = created.args.id;
        const localMonthly = Math.round(inUsd ? amount * rateToNumber(locked.rate) : amount);
        const link = buildClaimLink(id, claimKey, business, name.trim(), localMonthly);
        savePayslipMeta(addresses.payroll, id, {
          name: name.trim(),
          country: CURRENCIES[currency].country,
          monthlyLocal: localMonthly,
          link,
        });
        setDone({ id, link });
      }, business);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setStep(undefined);
    }
  }

  if (!isConfigured) {
    return (
      <div className="container page">
        <NotConfigured />
      </div>
    );
  }

  if (acct.ready && !acct.address) {
    return (
      <div className="narrow page stack">
        <p>Sign in to your business first.</p>
        <Link className="btn btn-accent" href="/employer">
          Start paying
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="narrow page stack-lg">
        <div className="stack">
          <span className="chip chip-verified">✓ Payslip funded</span>
          <h1 className="display" style={{ fontSize: 48 }}>
            Send {name.split(" ")[0]} their pay link
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            They open it on their phone, use Face ID, and see their pay growing in {CURRENCIES[currency].code}. The link
            works once. If it isn&apos;t used in time, you can take the money back.
          </p>
        </div>
        <div className="link-box">
          <code>{done.link}</code>
          <button
            className="btn btn-accent btn-sm"
            onClick={() => {
              navigator.clipboard.writeText(done.link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/employer" className="btn btn-ghost">
            Back to payroll
          </Link>
        </div>
      </div>
    );
  }

  const c = CURRENCIES[currency];

  return (
    <div className="narrow page stack-lg">
      <div className="stack" style={{ gap: 4 }}>
        <Link href="/employer" className="small muted" style={{ textDecoration: "none" }}>
          ← Payroll
        </Link>
        <h1 className="display" style={{ fontSize: 44 }}>
          Pay a freelancer
        </h1>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" className="input" placeholder="Priya Raman" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>Where they live</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CURRENCY_LIST.map((cur) => (
              <button
                key={cur.code}
                type="button"
                className="chip"
                onClick={() => setCurrency(cur.code)}
                aria-pressed={currency === cur.code}
                style={{
                  height: 36,
                  cursor: "pointer",
                  borderColor: currency === cur.code ? "var(--ink)" : "var(--line)",
                }}
              >
                <Flag code={cur.code} /> {cur.country} · {cur.code}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label htmlFor="amount">Monthly pay</label>
            <div className="segmented" role="group" aria-label="Enter amount in">
              <button type="button" aria-pressed={!inUsd} onClick={() => setInUsd(false)}>
                {c.code}
              </button>
              <button type="button" aria-pressed={inUsd} onClick={() => setInUsd(true)}>
                USD
              </button>
            </div>
          </div>
          <input
            id="amount"
            className="input input-money"
            inputMode="decimal"
            placeholder={inUsd ? "$1,500" : `${c.symbol}1,25,000`}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
          {amount > 0 && rate > 0 && (
            <span className="small muted">
              {inUsd ? `≈ ${formatLocal(monthlyLocal, currency, 0)} a month` : `≈ ${formatUsd(monthlyUsd)} a month`}
            </span>
          )}
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="period">Fund for</label>
            <select id="period" className="select" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {PERIODS.map((p) => (
                <option key={p.seconds} value={p.seconds}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="start">Start date</label>
            <input
              id="start"
              type="date"
              className="input"
              value={startDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="window">Pay link expires after</label>
          <select id="window" className="select" value={linkWindow} onChange={(e) => setLinkWindow(Number(e.target.value))}>
            {LINK_WINDOWS.map((w) => (
              <option key={w.seconds} value={w.seconds}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <QuoteCard
        currency={currency}
        armed={armed}
        onLock={setLock}
        onQuote={(q, s) => {
          setQuote(q);
          setStale(s);
        }}
      />

      <div className="card stack">
        <div className="kv">
          <span>You fund now</span>
          <strong>{fundUsd > 0 ? formatUsd(fundUsd) : "—"}</strong>
        </div>
        <div className="kv">
          <span>{name.split(" ")[0] || "They"} earn per day</span>
          <span>{monthlyLocal > 0 ? formatLocal(monthlyLocal / 30, currency) : "—"}</span>
        </div>
        <div className="kv">
          <span>Payroll balance</span>
          <span>{balance === undefined ? "…" : formatUsd(usdToNumber(balance))}</span>
        </div>
        {overBudget && (
          <div className="notice notice-danger">
            That&apos;s more than your payroll balance. Add funds or lower the amount.
          </div>
        )}
        {error && <div className="notice notice-danger">{error}</div>}
        <button className="btn btn-accent btn-block" disabled={!lock || !!step || overBudget || stale} onClick={confirm}>
          {step ? (
            <>
              <Spinner /> {step}
            </>
          ) : stale ? (
            "Rate refreshing…"
          ) : lock ? (
            `Pay ${fundUsd > 0 ? formatUsd(fundUsd) : ""} at ${rateToNumber(lock.rate).toFixed(2)}`
          ) : (
            "Pay"
          )}
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          Pay streams every second from the start date. Stop any time: earned pay stays with them, the rest comes back
          to you instantly.
        </p>
      </div>
    </div>
  );
}

function buildClaimLink(id: bigint, claimKey: Hex, from: string, to: string, monthly: number) {
  // The claim key goes in the fragment (#), which browsers never send to any server.
  const params = new URLSearchParams({ k: claimKey, from: from || "Your client", to, m: String(monthly) });
  return `${window.location.origin}/claim/${id}#${params.toString()}`;
}
