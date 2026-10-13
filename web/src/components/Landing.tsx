"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Morph } from "./Motion";
import { useFrameNow } from "./ui";
import { sfx } from "@/lib/sound";

function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

export function Scribble({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <span className="scribble">
      {children}
      <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden style={{ "--delay": `${delay}ms` } as CSSProperties}>
        <path d="M3 9.5C42 4.5 96 3 197 6.5" pathLength={1} />
      </svg>
    </span>
  );
}

export function FloatStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0, ty = 0, x = 0, y = 0;
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      el.style.setProperty("--mx", x.toFixed(3));
      el.style.setProperty("--my", y.toFixed(3));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className={`float-stage ${className}`}>
      {children}
    </div>
  );
}

export function Floater({ src, width, depth = 12, style, className = "" }: { src: string; width: number; depth?: number; style?: CSSProperties; className?: string }) {
  return (
    <span className={`floater ${className}`} style={{ ...style, width, "--depth": depth } as CSSProperties} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} />
    </span>
  );
}

const PLACES = [
  { id: "mex", name: "Luis", city: "Mexico City", amount: "MX$27,500", x: 22.3, y: 49.9 },
  { id: "los", name: "Tunde", city: "Lagos", amount: "₦2,300,000", x: 47.9, y: 54.5 },
  { id: "blr", name: "Priya", city: "Bengaluru", amount: "₹1,25,000", x: 67.6, y: 52.5 },
  { id: "mnl", name: "Ana", city: "Manila", amount: "₱84,000", x: 77.1, y: 49.9 },
];
const HOME = { x: 28.1, y: 41.2 };
const H = 66.4;

export function WorldRoutes() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [active, setActive] = useState("blr");
  return (
    <div ref={ref} className={`routes${inView ? " in" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="routes-map" src="/landing/map.webp" alt="" draggable={false} />
      <svg className="routes-lines" viewBox={`0 0 100 ${H}`} aria-hidden>
        {PLACES.map((p, i) => {
          const x1 = HOME.x, y1 = (HOME.y * H) / 100, x2 = p.x, y2 = (p.y * H) / 100;
          const cx = (x1 + x2) / 2, cy = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.28;
          return (
            <path
              key={p.id}
              d={`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`}
              pathLength={1}
              className={active === p.id ? "on" : ""}
              style={{ "--i": i } as CSSProperties}
            />
          );
        })}
      </svg>
      <span className="pin pin-home" style={{ left: `${HOME.x}%`, top: `${HOME.y}%` }}>
        <span className="pin-dot" />
        <span className="pin-card">
          <strong>Acme Studio</strong>
          <span className="small muted">New York · pays in AUSD</span>
        </span>
      </span>
      {PLACES.map((p, i) => (
        <button
          key={p.id}
          type="button"
          className={`pin${active === p.id ? " on" : ""}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, "--i": i } as CSSProperties}
          onMouseEnter={() => setActive(p.id)}
          onFocus={() => setActive(p.id)}
          onClick={() => {
            setActive(p.id);
            sfx("select");
          }}
          aria-label={`${p.name} in ${p.city} gets ${p.amount} a month`}
        >
          <span className="pin-dot" />
          <span className="pin-card">
            <strong>
              {p.name} · {p.amount}
            </strong>
            <span className="small muted">{p.city} · every second</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Marquee({ children }: { children: ReactNode }) {
  return (
    <div className="marquee">
      <div className="marquee-track">
        <div className="marquee-group">{children}</div>
        <div className="marquee-group" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

function TickerMini() {
  const now = useFrameNow();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const v = 38515.53 + (mounted ? (now % 100000) * (125000 / 2592000) : 0);
  const [whole, cents] = v.toFixed(2).split(".");
  return (
    <div className="mini-ticker money" aria-hidden>
      ₹{Number(whole).toLocaleString("en-IN")}
      <span className="cents">.{cents}</span>
    </div>
  );
}

function LockMini() {
  return (
    <div className="mini-lock" aria-hidden>
      <span className="mini-ring">
        <svg viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" />
          <circle cx="18" cy="18" r="15" pathLength={1} className="mini-ring-run" />
        </svg>
        <svg viewBox="0 0 24 24" className="mini-ring-icon">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <span>
        <strong>1 USD = 83.42 INR</strong>
        <span className="small muted">Checked by Chainlink · 12s old</span>
      </span>
    </div>
  );
}

function PasskeyMini() {
  return (
    <div className="mini-passkey" aria-hidden>
      <svg viewBox="0 0 48 48">
        <path d="M6 16V10a4 4 0 0 1 4-4h6M32 6h6a4 4 0 0 1 4 4v6M42 32v6a4 4 0 0 1-4 4h-6M16 42h-6a4 4 0 0 1-4-4v-6" />
        <path d="M17 18v3M31 18v3M24 18v8h-2M18 32c3.5 3 8.5 3 12 0" />
      </svg>
      <span className="mini-scan" />
    </div>
  );
}

function WithdrawMini() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${done ? "btn-ghost" : "btn-accent"} mini-withdraw`}
      onClick={() => {
        setDone((d) => !d);
        if (!done) sfx("success");
      }}
    >
      <Morph>{done ? "Sent · ₹0 in fees" : "Withdraw ₹38,515"}</Morph>
    </button>
  );
}

const FEATURES = [
  { title: "Paid every second", body: "Earnings grow from the first minute of work, in rupees, pesos or naira.", ui: <TickerMini /> },
  { title: "A rate you can check", body: "Locked the moment you pay, from a rate two sources agree on.", ui: <LockMini /> },
  { title: "Face ID, nothing to install", body: "Freelancers open a link and confirm with their face or fingerprint.", ui: <PasskeyMini /> },
  { title: "Free to withdraw", body: "Take money out whenever you like. Try it.", ui: <WithdrawMini /> },
];

export function FeatureCards() {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref} className={`features${inView ? " in" : ""}`}>
      {FEATURES.map((f, i) => (
        <div key={f.title} className="feature" style={{ "--i": i } as CSSProperties}>
          <div className="feature-ui">{f.ui}</div>
          <strong>{f.title}</strong>
          <p className="small muted">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export function StampIn({ children }: { children: ReactNode }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <div ref={ref} className={`stamp-in${inView ? " in" : ""}`}>
      {children}
    </div>
  );
}

export function Ring({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <span className="ring-word">
      {children}
      <svg viewBox="0 0 200 64" preserveAspectRatio="none" aria-hidden style={{ "--delay": `${delay}ms` } as CSSProperties}>
        <path d="M150 8C112 1 34 3 12 22C-6 38 30 58 98 59C160 60 198 48 194 30C191 15 160 6 118 6" pathLength={1} />
      </svg>
    </span>
  );
}

const CLOUDS = [
  { src: "/landing/cloud-a.webp", width: 520, top: "4%", duration: 120, delay: -30, opacity: 0.95 },
  { src: "/landing/cloud-b.webp", width: 760, top: "16%", duration: 160, delay: -100, opacity: 0.75 },
  { src: "/landing/cloud-a.webp", width: 340, top: "30%", duration: 95, delay: -60, opacity: 0.85 },
  { src: "/landing/cloud-b.webp", width: 600, top: "44%", duration: 140, delay: -15, opacity: 0.6 },
  { src: "/landing/cloud-a.webp", width: 440, top: "52%", duration: 110, delay: -85, opacity: 0.9 },
];

const BUTTERFLIES = [
  { left: "7%", top: "430px", size: 46, duration: 13, delay: 0 },
  { left: "17%", top: "540px", size: 32, duration: 11, delay: -4 },
  { left: "50%", top: "505px", size: 62, duration: 15, delay: -2 },
  { left: "80%", top: "410px", size: 38, duration: 12, delay: -6 },
  { left: "90%", top: "560px", size: 30, duration: 10, delay: -3 },
];

export function Sky() {
  return (
    <div className="sky" aria-hidden>
      {CLOUDS.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          className="sky-cloud"
          src={c.src}
          alt=""
          draggable={false}
          style={{ width: c.width, top: c.top, opacity: c.opacity, "--dur": `${c.duration}s`, "--delay": `${c.delay}s` } as CSSProperties}
        />
      ))}
      {BUTTERFLIES.map((b, i) => (
        <span
          key={i}
          className="butterfly"
          style={{ left: b.left, top: b.top, width: b.size, "--dur": `${b.duration}s`, "--delay": `${b.delay}s` } as CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/butterfly.webp" alt="" draggable={false} style={{ "--flap": `${0.28 + i * 0.04}s` } as CSSProperties} />
        </span>
      ))}
    </div>
  );
}
