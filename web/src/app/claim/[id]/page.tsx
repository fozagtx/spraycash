"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { spraycashPayrollAbi } from "@/lib/abi";
import { chainNow, publicClient, readPayslip, ZERO_ADDRESS, type Payslip } from "@/lib/chain";
import { addresses, isConfigured } from "@/lib/config";
import { currencyFromKey } from "@/lib/currencies";
import { formatDate, formatLocal, formatUsd, rateToNumber, usdToNumber } from "@/lib/format";
import { knownAddress, passkeyErrorMessage } from "@/lib/passkey";
import { sendGasless } from "@/lib/relay";
import { rememberClientName } from "@/lib/store";
import { usePasskeyAccount } from "@/lib/useAccount";
import { Flag, LiveDot, NotConfigured, Spinner } from "@/components/ui";

type LinkParams = { key?: Hex; from: string; to: string; monthly: number };

function readFragment(): LinkParams {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const k = params.get("k") ?? undefined;
  return {
    key: k && isHex(k) && k.length === 66 ? (k as Hex) : undefined,
    from: params.get("from") || "Your client",
    to: params.get("to") || "",
    monthly: Number(params.get("m") || 0),
  };
}

export default function ClaimPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const router = useRouter();
  const id = useMemo(() => {
    try {
      return BigInt(idParam);
    } catch {
      return null;
    }
  }, [idParam]);

  const [link, setLink] = useState<LinkParams>();
  const [payslip, setPayslip] = useState<Payslip | null>();
  const [step, setStep] = useState<string>();
  const [error, setError] = useState<string>();
  const scope = payslip ? ({ kind: "client", employer: getAddress(payslip.employer) } as const) : null;
  const acct = usePasskeyAccount(scope);

  useEffect(() => setLink(readFragment()), []);
  useEffect(() => {
    if (id === null) return setPayslip(null);
    readPayslip(id)
      .then(setPayslip)
      .catch(() => setPayslip(null));
  }, [id]);

  // Already claimed by this device's account for this client: go straight to the live payslip.
  useEffect(() => {
    if (!payslip || payslip.freelancer === ZERO_ADDRESS) return;
    const mine = knownAddress({ kind: "client", employer: getAddress(payslip.employer) });
    if (mine && getAddress(mine) === getAddress(payslip.freelancer)) router.replace(`/payslip/${payslip.id}`);
  }, [payslip, router]);

  if (!isConfigured) {
    return (
      <div className="narrow page">
        <NotConfigured />
      </div>
    );
  }

  if (payslip === undefined || !link) {
    return (
      <div className="narrow page" style={{ display: "flex", gap: 10 }}>
        <Spinner /> <span className="muted">Opening your pay link…</span>
      </div>
    );
  }

  const now = chainNow();
  const currency = payslip ? currencyFromKey(payslip.currency) : undefined;
  const keyMatches = !!(link.key && payslip && getAddress(privateKeyToAccount(link.key).address) === getAddress(payslip.claimSigner));

  if (!payslip || !currency || !keyMatches) {
    return (
      <Problem title="This pay link doesn't work">
        Check that you copied the whole link, including everything after the <span className="mono">#</span>. If it
        still doesn&apos;t open, ask your client to send it again.
      </Problem>
    );
  }
  if (payslip.voided) {
    return (
      <Problem title="This pay link has expired">
        It wasn&apos;t opened in time, so the money went back to {link.from}. Ask them for a new link.
      </Problem>
    );
  }
  if (payslip.freelancer !== ZERO_ADDRESS) {
    return (
      <Problem title="This pay link has already been used">
        Each link connects to one account. If that was you, open <Link href="/me">My pay</Link> on the device you used.
      </Problem>
    );
  }
  if (now > Number(payslip.claimDeadline)) {
    return (
      <Problem title="This pay link has expired">
        {link.from} can take the money back and send you a new link. Let them know.
      </Problem>
    );
  }

  const rate = rateToNumber(payslip.lockedRate);
  const monthly = link.monthly || (usdToNumber(payslip.deposit) * rate * (30 * 86400)) / Number(payslip.end - payslip.start);
  const p = payslip;

  async function claim() {
    setError(undefined);
    try {
      await acct.withAccount(async (account) => {
        setStep("Connecting your account…");
        const digest = await publicClient.readContract({
          address: addresses.payroll,
          abi: spraycashPayrollAbi,
          functionName: "claimDigest",
          args: [p.id, account.address],
        });
        const signature = await privateKeyToAccount(link!.key!).signMessage({ message: { raw: digest } });
        await sendGasless(
          account,
          addresses.payroll,
          encodeFunctionData({ abi: spraycashPayrollAbi, functionName: "claim", args: [p.id, signature] }),
        );
        rememberClientName(getAddress(p.employer), link!.from);
        router.push(`/payslip/${p.id}`);
      }, link!.to || "Spraycash account");
    } catch (e) {
      setError(passkeyErrorMessage(e));
      setStep(undefined);
    }
  }

  return (
    <div className="narrow page stack-lg">
      <div className="card card-hero stack-lg">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="person">
            <Flag code={currency.code} large />
            <span className="small muted">{link.to ? `Hi ${link.to.split(" ")[0]}` : "Hi there"}</span>
          </span>
          <LiveDot />
        </div>
        <h1 className="display" style={{ fontSize: "clamp(36px, 9vw, 52px)" }}>
          {link.from} is paying you {formatLocal(monthly, currency.code, 0)}/month.
        </h1>
        <div className="stack" style={{ gap: 0 }}>
          <div className="kv">
            <span>Rate locked</span>
            <span>1 USD = {rate.toFixed(2)} {currency.code}</span>
          </div>
          <div className="kv">
            <span>Funded</span>
            <span>
              {formatLocal(usdToNumber(p.deposit) * rate, currency.code, 0)}{" "}
              <span className="muted">({formatUsd(usdToNumber(p.deposit))})</span>
            </span>
          </div>
          <div className="kv">
            <span>Pay starts</span>
            <span>{Number(p.start) <= now + 120 ? "Now, every second" : formatDate(Number(p.start))}</span>
          </div>
        </div>
        <button className="btn btn-accent btn-block" onClick={claim} disabled={!!step || acct.busy}>
          {step ? (
            <>
              <Spinner /> {step}
            </>
          ) : (
            "Continue with passkey"
          )}
        </button>
        {error && <div className="notice notice-danger">{error}</div>}
        <p className="small muted" style={{ margin: 0 }}>
          Use Face ID, your fingerprint or screen lock. You get a separate account just for {link.from}, and
          withdrawing is always free.
        </p>
      </div>
    </div>
  );
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="narrow page">
      <div className="card stack">
        <h1 className="display" style={{ fontSize: 36 }}>
          {title}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {children}
        </p>
      </div>
    </div>
  );
}
