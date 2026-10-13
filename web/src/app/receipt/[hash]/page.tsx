"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getAddress, isHash, parseEventLogs, type Hex } from "viem";
import { paydayPayrollAbi } from "@/lib/abi";
import { findFundingTx, findRateTx, publicClient, readPayslip, type Payslip } from "@/lib/chain";
import { addresses, explorerAddress, explorerTx } from "@/lib/config";
import { currencyFromKey, type Currency } from "@/lib/currencies";
import { formatDate, formatLocal, formatUsd, rateToNumber, shortHash, usdToNumber } from "@/lib/format";
import { clientName } from "@/lib/store";
import { Flag, Spinner } from "@/components/ui";

type Receipt = {
  hash: Hex;
  payslip: Payslip;
  currency: Currency;
  amountUsd: number;
  amountLocal: number;
  freelancer: Hex;
  timestamp: number;
  fundingTx?: Hex;
  rateTx?: Hex;
};

export default function ReceiptPage() {
  const { hash } = useParams<{ hash: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>();

  useEffect(() => {
    if (!isHash(hash)) return setReceipt(null);
    (async () => {
      const tx = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
      const [log] = parseEventLogs({
        abi: paydayPayrollAbi,
        logs: tx.logs.filter((l) => getAddress(l.address) === getAddress(addresses.payroll)),
        eventName: "Withdrawn",
      });
      if (!log) return setReceipt(null);
      const payslip = await readPayslip(log.args.id);
      const currency = currencyFromKey(payslip.currency);
      if (!currency) return setReceipt(null);
      const [block, fundingTx, rateTx] = await Promise.all([
        publicClient.getBlock({ blockNumber: tx.blockNumber }),
        findFundingTx(payslip.id, payslip.createdBlock).catch(() => undefined),
        findRateTx(currency.code, payslip.rateBlock).catch(() => undefined),
      ]);
      setReceipt({
        hash,
        payslip,
        currency,
        amountUsd: usdToNumber(log.args.amount),
        amountLocal: Number(log.args.localAmount) / 1e6,
        freelancer: log.args.freelancer,
        timestamp: Number(block.timestamp),
        fundingTx,
        rateTx,
      });
    })().catch(() => setReceipt(null));
  }, [hash]);

  if (receipt === undefined) {
    return (
      <div className="narrow page" style={{ display: "flex", gap: 10 }}>
        <Spinner /> <span className="muted">Preparing your receipt…</span>
      </div>
    );
  }
  if (receipt === null) {
    return (
      <div className="narrow page card">
        <p style={{ margin: 0 }}>We couldn&apos;t find a withdrawal with that receipt number.</p>
      </div>
    );
  }

  const r = receipt;
  const rate = rateToNumber(r.payslip.lockedRate);
  const from = clientName(getAddress(r.payslip.employer)) || "Your client";

  return (
    <div className="narrow page stack-lg">
      <div className="receipt">
        <div className="stack" style={{ textAlign: "center", gap: 6 }}>
          <span className="eyebrow">Payslip receipt</span>
          <div className="money" style={{ fontSize: "clamp(48px, 11vw, 72px)" }}>
            {formatLocal(r.amountLocal, r.currency.code)}
          </div>
          <span className="muted small">
            {formatUsd(r.amountUsd, r.amountUsd < 1 ? 4 : 2)} USD · withdrawn {formatDate(r.timestamp)}
          </span>
        </div>
        <hr className="divider" />
        <div>
          <div className="receipt-row">
            <span className="muted">From</span>
            <span>
              {from}
              <a className="verify" href={explorerAddress(r.payslip.employer)} target="_blank" rel="noreferrer">
                Verify
              </a>
            </span>
          </div>
          <div className="receipt-row">
            <span className="muted">Paid to</span>
            <span className="mono">
              {shortHash(r.freelancer)}
              <a className="verify" href={explorerAddress(r.freelancer)} target="_blank" rel="noreferrer">
                Verify
              </a>
            </span>
          </div>
          <div className="receipt-row">
            <span className="muted">Amount</span>
            <span>
              {formatUsd(r.amountUsd)}
              <a className="verify" href={explorerTx(r.hash)} target="_blank" rel="noreferrer">
                Verify
              </a>
            </span>
          </div>
          <div className="receipt-row">
            <span className="muted">Rate locked</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Flag code={r.currency.code} /> 1 USD = {rate.toFixed(4)} {r.currency.code}
              {r.rateTx && (
                <a className="verify" href={explorerTx(r.rateTx)} target="_blank" rel="noreferrer">
                  Verify
                </a>
              )}
            </span>
          </div>
          <div className="receipt-row">
            <span className="muted">Rate source</span>
            <span>Chainlink verified report</span>
          </div>
          <div className="receipt-row">
            <span className="muted">Funded by client</span>
            <span>
              {formatUsd(usdToNumber(r.payslip.deposit))}
              {r.fundingTx && (
                <a className="verify" href={explorerTx(r.fundingTx)} target="_blank" rel="noreferrer">
                  Verify
                </a>
              )}
            </span>
          </div>
          <div className="receipt-row">
            <span className="muted">Fees</span>
            <span>None</span>
          </div>
          <div className="receipt-row">
            <span className="muted">Receipt no.</span>
            <span className="mono">{shortHash(r.hash)}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", paddingTop: 12 }}>
        <Link className="btn btn-ghost" href={`/payslip/${r.payslip.id}`}>
          Back to my pay
        </Link>
        <button className="btn btn-ghost" onClick={() => window.print()}>
          Save as PDF
        </button>
      </div>
    </div>
  );
}
