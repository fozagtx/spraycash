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
import { Flag, LiveDot, NotConfigured, Spinner, useNow } from "@/components/ui";

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
    <div className="narrow page stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="display" style={{ fontSize: 44 }}>
          My pay
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          One passkey, a separate account for each client, so every income stream stays cleanly apart.
        </p>
      </div>

      {!clients ? (
        <div style={{ display: "flex", gap: 10 }}>
          <Spinner /> <span className="muted">Loading…</span>
        </div>
      ) : clients.length === 0 ? (
        <div className="card stack">
          <strong>No pay on this device yet</strong>
          <p className="muted small" style={{ margin: 0 }}>
            Open the pay link your client sent you. After you continue with your passkey, your pay shows up here.
          </p>
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
                  className="kv"
                  style={{ textDecoration: "none", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 14 }}
                >
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <Flag code={currency.code} />
                    {status === "streaming" ? <LiveDot label="Live" /> : <LiveDot off label={status} />}
                  </span>
                  <span className="money" style={{ fontSize: 28, color: "var(--ink)" }}>
                    {formatLocal(available * rate, currency.code)} →
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
