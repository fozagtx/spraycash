"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type TourStep = { target: string; title: string; body: string };

const PAD = 8;
const doneKey = (id: string) => `spraycash:tour:${id}`;
const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

export function Tour({ id, steps }: { id: string; steps: TourStep[] }) {
  const [active, setActive] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const start = useCallback(() => {
    const available = steps.filter((s) => find(s.target));
    if (available.length === 0) return;
    setIndex(0);
    setActive(available);
  }, [steps]);

  const close = useCallback(() => {
    setActive(null);
    setRect(null);
    try {
      localStorage.setItem(doneKey(id), "1");
    } catch {}
  }, [id]);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(doneKey(id)) === "1";
    } catch {}
    if (seen || navigator.webdriver) return;
    const timer = setInterval(() => {
      if (find(steps[0].target)) {
        clearInterval(timer);
        setTimeout(start, 500);
      }
    }, 400);
    return () => clearInterval(timer);
  }, [id, steps, start]);

  const step = active?.[index];

  useEffect(() => {
    if (!step) return;
    const el = find(step.target);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    let frame = 0;
    let prev = "";
    const track = () => {
      const r = el.getBoundingClientRect();
      const sig = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (sig !== prev) {
        prev = sig;
        setRect(r);
      }
      frame = requestAnimationFrame(track);
    };
    track();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    nextRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, close]);

  const last = active ? index === active.length - 1 : false;
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const width = Math.min(320, vw - 32);
  const below = rect ? vh - rect.bottom > 200 || rect.top < 200 : true;
  const left = rect ? Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 16)) : 16;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <>
      <button type="button" className="tour-help" onClick={start} aria-label="Show me how this page works" title="Show me how">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        <span>Show me how</span>
      </button>
      {active && step && rect && (
        <div className="tour-layer">
          <div className="tour-backdrop" onClick={close} />
          <div
            className="tour-spot"
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          />
          <div
            key={index}
            className="tour-pop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            style={{ width, left, ...(below ? { top: rect.bottom + PAD + 12 } : { bottom: vh - rect.top + PAD + 12 }) }}
          >
            <span className="tour-count">
              {index + 1} of {active.length}
            </span>
            <strong id="tour-title" className="tour-title">
              {step.title}
            </strong>
            <p className="tour-body">{step.body}</p>
            <div className="tour-actions">
              <button type="button" className="tour-skip" onClick={close}>
                {last ? "Close" : "Skip"}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                {index > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIndex(index - 1)}>
                    Back
                  </button>
                )}
                <button ref={nextRef} type="button" className="btn btn-ink btn-sm" onClick={() => (last ? close() : setIndex(index + 1))}>
                  {last ? "Got it" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
