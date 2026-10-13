import Link from "next/link";
import { LandingDemo } from "@/components/LandingDemo";

export default function Home() {
  return (
    <>
      <section className="section">
        <div className="container hero-grid">
          <div className="stack-lg">
            <span className="chip chip-verified">Payroll for teams across borders</span>
            <h1 className="display">Pay freelancers anywhere. They get paid every second.</h1>
            <p className="lede">
              Fund payroll in dollars. Your team sees earnings tick up in their own currency, at a rate locked the
              moment you hit pay.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/employer" className="btn btn-accent">
                Start paying
              </Link>
              <Link href="/me" className="btn btn-ghost">
                I&apos;m getting paid
              </Link>
            </div>
            <p className="small muted">Sign in with Face ID or your fingerprint. No passwords, no paperwork.</p>
          </div>
          <LandingDemo />
        </div>
      </section>

      <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="container stack-lg">
          <h2 className="display">Your freelancers shouldn&apos;t wait 30 days to get paid.</h2>
          <div className="steps">
            <div className="card stack">
              <div className="step-num">1</div>
              <strong>Add a freelancer</strong>
              <p className="muted small" style={{ margin: 0 }}>
                Name, country and monthly pay in their currency: rupees, pesos or naira.
              </p>
            </div>
            <div className="card stack">
              <div className="step-num">2</div>
              <strong>Lock a verified rate</strong>
              <p className="muted small" style={{ margin: 0 }}>
                A live rate, checked against two independent sources, is locked the moment you confirm. No padded spread.
              </p>
            </div>
            <div className="card stack">
              <div className="step-num">3</div>
              <strong>Pay starts flowing</strong>
              <p className="muted small" style={{ margin: 0 }}>
                They open a link, use Face ID, and watch their pay grow every second. Withdraw any time, free.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="container" style={{ display: "grid", gap: "var(--s3)", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div className="stack">
            <div className="eyebrow">For clients</div>
            <p style={{ margin: 0 }}>One balance in dollars for your whole team, in every country. Stop pay any time and unearned pay comes straight back.</p>
          </div>
          <div className="stack">
            <div className="eyebrow">For freelancers</div>
            <p style={{ margin: 0 }}>Know your rate before you start. See every rupee as you earn it. Each client gets its own separate account, all behind one passkey.</p>
          </div>
          <div className="stack">
            <div className="eyebrow">Checkable</div>
            <p style={{ margin: 0 }}>Every rate, payment and withdrawal has a public record. Tap &ldquo;Verify&rdquo; on any receipt to see it.</p>
          </div>
        </div>
      </section>
    </>
  );
}
