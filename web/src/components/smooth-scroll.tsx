"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

let lenis: Lenis | null = null;

export const getLenis = () => lenis;

export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    lenis = new Lenis({ autoRaf: true, anchors: true, allowNestedScroll: true, lerp: 0.1 });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);
  return null;
}
