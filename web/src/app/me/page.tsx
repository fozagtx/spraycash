"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { earnedAt, payslipStatus, readFreelancerPayslipIds, readPayslips, type Payslip } from "@/lib/chain";
import { explorerAddress, isConfigured } from "@/lib/config";
import { currencyFromKey } from "@/lib/currencies";
import { formatLocal, rateToNumber, shortHash, usdToNumber } from "@/lib/format";
import { knownClientAccounts } from "@/lib/passkey";
import { clientName } from "@/lib/store";
import { Flag, LiveDot, NotConfigured, useNow } from "@/components/ui";
import { Skeleton } from "@/components/Motion";

type ClientAccount = { employer: Address; account: Address; payslips: Payslip[] };

export default function MyPayPage() {
  const [clients, setClients] = useState<ClientAccount[]>();
  const now = useNow(200);

  useEffect(() => {
    const known = knownClientAccounts();
    Promise.all(
      known.map(async (k) => ({
        ...k,
        payslips: await readPayslips([...(await readFreelancerPayslipIds(k.account))].reverse()),
      })),
    )
      .then((list) => setClients(list.filter((c) => c.payslips.length > 0)))
      .catch(() => setClients([]));
  }, []);

  if (!isConfigured) {
    return (
      <div className="narrow page">
        <NotConfigured />
      </div>
    );
  }

  return (
    <div className="narrow page stack-lg reveal">
      <div className="page-intro">
        <h1 className="display">My pay</h1>
        <p>
          One passkey, a separate account for each client, so every income stream stays cleanly apart.
        </p>
      </div>

      {!clients ? (
        <div className="card" style={{ display: "grid", gap: 14 }} aria-label="Loading">
          <Skeleton w="35%" h={14} />
          <Skeleton w="22%" h={10} />
          <Skeleton w="100%" h={36} />
        </div>
      ) : clients.length === 0 ? (
        <div className="card empty">
          <span className="empty-mark" style={{ color: "var(--accent)" }} aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
          </span>
          <strong>No pay on this device yet</strong>
          <p className="muted" style={{ margin: 0, maxWidth: "40ch" }}>
            Open the pay link your client sent you. After you continue with your passkey, your pay shows up here.
          </p>
          <Link href="/" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
            How Spraycash works
          </Link>
        </div>
      ) : (
        clients.map((c) => (
          <div className="card stack" key={c.account}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <strong>{clientName(c.employer) || "Client"}</strong>
                <div className="small muted">
                  Account{" "}
                  <a className="mono" href={explorerAddress(c.account)} target="_blank" rel="noreferrer">
                    {shortHash(c.account)}
                  </a>
                </div>
              </div>
            </div>
            {c.payslips.map((p) => {
              const currency = currencyFromKey(p.currency);
              if (!currency) return null;
              const rate = rateToNumber(p.lockedRate);
              const available = Math.max(0, earnedAt(p, now) - usdToNumber(p.withdrawn));
              const status = payslipStatus(p, now);
              return (
                <Link
                  key={p.id.toString()}
                  href={`/payslip/${p.id}`}
                  className="kv pay-row"
                  style={{ textDecoration: "none", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 14 }}
                >
                  <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <Flag code={currency.code} />
                    <span style={{ display: "grid", gap: 2 }}>
                      <span style={{ color: "var(--ink)", fontWeight: 500 }}>Payslip #{p.id.toString()}</span>
                      {status === "streaming" ? <LiveDot label="Live" /> : <LiveDot off label={status} />}
                    </span>
                  </span>
                  <span className="money" style={{ fontSize: 28, color: "var(--ink)" }} aria-label={`Ready to withdraw ${formatLocal(available * rate, currency.code)}`}>
                    {formatLocal(available * rate, currency.code)}
                    <svg className="pay-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
