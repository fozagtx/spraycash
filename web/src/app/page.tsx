import Link from "next/link";
import { LandingDemo } from "@/components/LandingDemo";
import { LogoMark } from "@/components/Logo";

const CORRIDORS = [
  { flag: "linear-gradient(#FF9933 0 33%, #FFFFFF 33% 66%, #138808 66%)", country: "India", amount: "₹1,25,000", code: "INR" },
  { flag: "linear-gradient(90deg, #006847 0 33%, #FFFFFF 33% 66%, #CE1126 66%)", country: "Mexico", amount: "MX$27,500", code: "MXN" },
  { flag: "linear-gradient(#0038A8 0 50%, #CE1126 50%)", country: "Philippines", amount: "₱84,000", code: "PHP" },
  { flag: "linear-gradient(90deg, #008751 0 33%, #FFFFFF 33% 66%, #008751 66%)", country: "Nigeria", amount: "₦2,300,000", code: "NGN" },
];

const COMPARE = [
  ["Paid 30 days later, once the invoice clears", "Paid every second, from the first minute of work"],
  ["The exchange rate is a surprise when the money lands", "The rate is locked the moment the client hits pay"],
  ["Transfer and conversion fees on both ends", "Withdrawing is free. No fees, ever"],
  ["A different payment rail for every country", "One dollar balance for your whole team"],
];

const FAQ = [
  [
    "Do my freelancers need to install anything?",
    "No. They open the link you send, confirm with Face ID or their fingerprint, and see their pay. No app, no password, nothing to write down.",
  ],
  [
    "Where does the exchange rate come from?",
    "Every minute, Chainlink checks two independent rate sources and publishes the result only if they agree within 1%. You see how old the rate is, and Spraycash won't lock a rate older than 10 minutes.",
  ],
  [
    "What happens if I stop pay?",
    "Everything earned up to that second stays with your freelancer. Everything not yet earned comes straight back to your balance, instantly.",
  ],
  [
    "I work for three clients. Is that messy?",
    "No. One passkey gives you a separate account for each client, so every income stream stays apart for your records.",
  ],
  [
    "What if the link never gets opened?",
    "Links expire. Once a link expires unused, you take the full amount back with one tap.",
  ],
];

export default function Home() {
  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="section hero">
        <div className="container hero-grid">
          <div className="stack-lg">
            <span className="chip chip-verified">
              <span className="live-dot" aria-hidden /> Payroll across borders, paid every second
            </span>
            <h1 className="display">
              Pay your team anywhere. <em className="accent-italic">They get paid every second.</em>
            </h1>
            <p className="lede">
              Fund payroll in dollars. Your freelancers watch their earnings grow in their own currency, at a rate locked
              the moment you hit pay.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/employer" className="btn btn-accent btn-lg">
                Start paying
              </Link>
              <Link href="/me" className="btn btn-ghost btn-lg">
                I&apos;m getting paid
              </Link>
            </div>
            <ul className="ticks">
              <li>Sign in with Face ID</li>
              <li>No fees to withdraw</li>
              <li>Stop any time</li>
            </ul>
          </div>
          <LandingDemo />
        </div>
      </section>

      {/* ---------------------------------------------------------- corridors */}
      <section className="band">
        <div className="container corridors">
          <span className="small muted corridors-label">You pay in dollars. They see:</span>
          {CORRIDORS.map((c) => (
            <span key={c.code} className="corridor">
              <span className="flag flag-lg" style={{ background: c.flag }} aria-hidden />
              <span>
                <strong>{c.amount}</strong>
                <span className="small muted"> /month in {c.country}</span>
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ compare */}
      <section className="section">
        <div className="container stack-lg">
          <div className="section-head">
            <span className="eyebrow">Why Spraycash</span>
            <h2 className="display">Your freelancers shouldn&apos;t wait 30 days to get paid.</h2>
          </div>
          <div className="compare">
            <div className="compare-col">
              <div className="compare-title muted">The usual way</div>
              {COMPARE.map(([old]) => (
                <div key={old} className="compare-row old">
                  <span className="x" aria-hidden>
                    ×
                  </span>
                  {old}
                </div>
              ))}
            </div>
            <div className="compare-col compare-new">
              <div className="compare-title">
                <LogoMark size={20} /> With Spraycash
              </div>
              {COMPARE.map(([, next]) => (
                <div key={next} className="compare-row">
                  <span className="check" aria-hidden>
                    ✓
                  </span>
                  {next}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- how it works */}
      <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="container stack-lg">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2 className="display">Three steps. About a minute.</h2>
          </div>
          <div className="steps">
            <div className="card stack">
              <div className="step-num">1</div>
              <strong>Add a freelancer</strong>
              <p className="muted small" style={{ margin: 0 }}>
                Name, country and monthly pay in their currency: rupees, pesos or naira. Fund it from your dollar balance.
              </p>
            </div>
            <div className="card stack">
              <div className="step-num">2</div>
              <strong>Lock a verified rate</strong>
              <p className="muted small" style={{ margin: 0 }}>
                You see a live rate checked against two sources, with its age. It locks for 5 seconds while you confirm, with
                no padded spread.
              </p>
            </div>
            <div className="card stack">
              <div className="step-num">3</div>
              <strong>Send the link</strong>
              <p className="muted small" style={{ margin: 0 }}>
                They open it on their phone, use Face ID, and watch their pay grow every second. Withdraw any time, free.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ audiences */}
      <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="container audiences">
          <div className="card stack-lg">
            <span className="eyebrow">For clients</span>
            <h3 className="display h3">One balance. Every country.</h3>
            <ul className="list">
              <li>Fund payroll once, in dollars</li>
              <li>See every freelancer, what they&apos;ve earned and what&apos;s left, live</li>
              <li>Stop pay any time and unearned money returns instantly</li>
              <li>No per-country paperwork or payment rails</li>
            </ul>
            <Link href="/employer" className="btn btn-accent" style={{ alignSelf: "start" }}>
              Start paying
            </Link>
          </div>
          <div className="card stack-lg">
            <span className="eyebrow">For freelancers</span>
            <h3 className="display h3">Know your rate. Watch it grow.</h3>
            <ul className="list">
              <li>Your pay, in your currency, every second</li>
              <li>The rate is fixed before you start, not when the money lands</li>
              <li>Withdraw whenever you like, with no fees</li>
              <li>A separate account for each client, behind one passkey</li>
            </ul>
            <Link href="/me" className="btn btn-ghost" style={{ alignSelf: "start" }}>
              See my pay
            </Link>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- proof */}
      <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="container proof">
          <div className="stack-lg">
            <span className="eyebrow">Checkable, not just trusted</span>
            <h2 className="display">Every number has a receipt.</h2>
            <p className="lede">
              Every rate, every payment and every withdrawal is publicly recorded. Tap <strong>Verify</strong> next to any
              figure on a receipt to see the record behind it, including the exact Chainlink rate that was locked.
            </p>
          </div>
          <div className="mini-receipt" aria-hidden>
            <div className="eyebrow" style={{ textAlign: "center" }}>
              Payslip receipt
            </div>
            <div className="money" style={{ fontSize: 48, textAlign: "center", margin: "8px 0 16px" }}>
              ₹41,710.00
            </div>
            {[
              ["From", "Acme Studio"],
              ["Amount", "$500.00"],
              ["Rate locked", "1 USD = 83.42 INR"],
              ["Fees", "None"],
            ].map(([k, v]) => (
              <div key={k} className="receipt-row">
                <span className="muted">{k}</span>
                <span>
                  {v}
                  {k !== "Fees" && <span className="verify">Verify</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- faq */}
      <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="container faq-wrap">
          <div className="section-head">
            <span className="eyebrow">Questions</span>
            <h2 className="display">Good to know</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p className="muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- cta */}
      <section className="container" style={{ paddingBottom: "var(--s5)" }}>
        <div className="cta">
          <div className="stack">
            <h2 className="display">Payroll that crosses borders as fast as the work does.</h2>
            <p style={{ margin: 0, opacity: 0.85 }}>Set up in a minute. Your first payslip can start streaming today.</p>
          </div>
          <Link href="/employer" className="btn btn-lg btn-light">
            Start paying
          </Link>
        </div>
      </section>
    </>
  );
}
