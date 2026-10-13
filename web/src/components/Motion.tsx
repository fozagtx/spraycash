"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TextMorph } from "torph/react";
import { onSoundChange, setSoundEnabled, sfx, unlockSound } from "@/lib/sound";

/** Header nav with a pill that slides to the active page. */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = links.findIndex((l) => path === l.href || path.startsWith(`${l.href}/`));
  return (
    <Segmented
      as="nav"
      className="nav"
      active={active}
      items={links.map((l, i) => (
        <Link key={l.href} href={l.href} aria-current={i === active ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      pillClass="nav-pill"
    />
  );
}

/** Measures the active child and slides a pill under it. */
function Segmented({
  as: Tag = "div",
  className,
  items,
  active,
  pillClass,
  ...rest
}: {
  as?: "div" | "nav";
  className: string;
  items: React.ReactNode[];
  active: number;
  pillClass: string;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const child = el.children[active + 1] as HTMLElement | undefined;
      setPill(child && active >= 0 ? { x: child.offsetLeft, w: child.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const t = requestAnimationFrame(() => setReady(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(t);
    };
  }, [active, items.length]);
  return (
    <Tag ref={ref as never} className={className} {...rest}>
      <span
        className={pillClass}
        aria-hidden
        style={{
          width: pill?.w ?? 0,
          transform: `translateX(${pill?.x ?? 0}px)`,
          opacity: pill ? 1 : 0,
          transition: ready ? undefined : "none",
        }}
      />
      {items}
    </Tag>
  );
}

/** Segmented control with a sliding pill (tabs sliding). */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  block,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  block?: boolean;
}) {
  const active = options.findIndex((o) => o.value === value);
  return (
    <Segmented
      className={`segmented${block ? " segmented-block" : ""}`}
      role="group"
      aria-label={label}
      active={active}
      pillClass="seg-pill"
      items={options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => {
            if (o.value !== value) sfx("select");
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    />
  );
}

/* ------------------------------------------------------------------ odometer */
// Adapted from rare-ui's animated-counter: each digit is a wheel that rolls to its new face.

const WHEEL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const mod = (n: number, m: number) => ((n % m) + m) % m;

function Wheel({ digit }: { digit: number }) {
  const reduced = useReducedMotion() ?? false;
  const pos = useMotionValue(digit);
  const goal = useRef(digit);
  useEffect(() => {
    if (reduced) {
      goal.current = digit;
      pos.set(digit);
      return;
    }
    if (mod(goal.current, 10) !== digit) {
      const at = pos.get();
      goal.current = at + mod(digit - at, 10);
    }
    const a = animate(pos, goal.current, { type: "spring", visualDuration: 0.6, bounce: 0.18 });
    return () => a.stop();
  }, [digit, reduced, pos]);
  const y = useTransform(pos, (p) => `${(-mod(p, 10) * 100) / WHEEL.length}%`);
  return (
    <span className="odo-digit" aria-hidden>
      <span className="sizer">0</span>
      <motion.span className="odo-wheel" style={{ y }}>
        {WHEEL.map((f, i) => (
          <span key={i}>{f}</span>
        ))}
      </motion.span>
    </span>
  );
}

/** Rolls each digit of a formatted string (e.g. "$23,501.56") into place. */
export function Odometer({ text, className }: { text: string; className?: string }) {
  const chars = [...text];
  let digitsSeen = chars.filter((c) => c >= "0" && c <= "9").length;
  return (
    <span className={`odo ${className ?? ""}`}>
      <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {text}
      </span>
      {chars.map((c, i) => {
        if (c >= "0" && c <= "9") {
          const key = `d${digitsSeen--}`;
          return <Wheel key={key} digit={Number(c)} />;
        }
        return (
          <span key={`m${i}-${c}`} className="odo-mark" aria-hidden>
            {c}
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ toast */

type Toast = { id: number; kind: "ok" | "danger"; text: string; leaving?: boolean };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 350);
  }, []);
  const push = useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, kind, text }]);
      sfx(kind === "ok" ? "success" : "error");
      setTimeout(() => dismiss(id), kind === "danger" ? 7000 : 4500);
    },
    [dismiss],
  );
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === "danger" ? " toast-danger" : ""}`} data-leaving={t.leaving || undefined}>
            <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {t.kind === "ok" ? <path d="M5 12.5 10 17.5 19 7.5" /> : <path d="M12 8v5M12 16.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />}
            </svg>
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ small pieces */

export function CopyButton({ text, className = "btn btn-accent btn-sm" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        sfx("copy");
      }}
    >
      <span className="swap">
        <span data-on={!copied} className="copy-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2.5" />
            <path d="M5 15V6a2 2 0 0 1 2-2h8" />
          </svg>
        </span>
        <span data-on={copied} className="copy-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5 10 17.5 19 7.5" />
          </svg>
        </span>
      </span>
      <TextMorph>{copied ? "Copied" : "Copy link"}</TextMorph>
    </button>
  );
}

export function SuccessCheck() {
  return (
    <span className="success" aria-hidden>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 10 17.5 19 7.5" />
      </svg>
    </span>
  );
}

/** Inline confirm for irreversible actions: the button opens a confirm/cancel pill in place. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  busy,
  onConfirm,
  busyNode,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  busyNode?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span className="confirm" ref={wrap}>
      {open && !busy ? (
        <span className="confirm-panel" role="group" aria-label={question}>
          <span>{question}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setOpen(false);
              sfx("cancel");
            }}
            style={{ background: "var(--surface)" }}
          >
            Keep
          </button>
          <button
            type="button"
            className="btn confirm-yes"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => {
            setOpen(true);
            sfx("warning");
          }}
          disabled={busy}
        >
          {busy ? busyNode : null} {label}
        </button>
      )}
    </span>
  );
}

export function Skeleton({ w = "100%", h = 16, r }: { w?: number | string; h?: number; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden />;
}

export function Accordion({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      {items.map(([q, a], i) => (
        <div key={q} className="faq-item" data-open={open === i}>
          <button type="button" className="faq-q" aria-expanded={open === i} onClick={() => {
              sfx(open === i ? "collapse" : "expand");
              setOpen(open === i ? null : i);
            }}>
            {q}
            <span className="faq-icon" aria-hidden />
          </button>
          <div className="faq-a" aria-hidden={open !== i}>
            <div>
              <p className="muted">{a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Morphs a button label as it changes, so the button never jumps. */
export function Morph({ children }: { children: string }) {
  return <TextMorph>{children}</TextMorph>;
}

export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const off = onSoundChange(setOn);
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      off();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={on ? "Turn sounds off" : "Turn sounds on"}
      title={on ? "Sounds on" : "Sounds off"}
      aria-pressed={on}
      onClick={() => setSoundEnabled(!on)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <g className="icon-btn-waves" data-on={on}>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </g>
        <path className="icon-btn-mute" data-on={!on} d="m16 9 5 6M21 9l-5 6" />
      </svg>
    </button>
  );
}
