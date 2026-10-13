"use client";

import type { createUISFX } from "uisfx";

type Player = ReturnType<typeof createUISFX>;
type Cue = Parameters<Player["play"]>[0];

let player: Player | null = null;
let loading: Promise<Player> | null = null;
const listeners = new Set<(on: boolean) => void>();

function load() {
  if (typeof window === "undefined") return null;
  if (!loading) {
    loading = import("uisfx").then(({ createUISFX }) => {
      player = createUISFX({ pack: "glass", volume: 0.45, preferences: { key: "spraycash:sound" } });
      listeners.forEach((l) => l(player!.isEnabled()));
      return player;
    });
  }
  return loading;
}

/** Call from a real pointer or key event so the browser lets audio start. */
export function unlockSound() {
  load()?.then((p) => p.unlock()).catch(() => {});
}

export function sfx(cue: Cue) {
  if (player) {
    player.play(cue);
    return;
  }
  load()?.then((p) => p.play(cue)).catch(() => {});
}

export function soundEnabled() {
  return player ? player.isEnabled() : true;
}

export function setSoundEnabled(on: boolean) {
  load()?.then((p) => {
    p.setEnabled(on);
    if (on) p.unlock().then(() => p.play("toggle-on")).catch(() => {});
    listeners.forEach((l) => l(on));
  });
}

export function onSoundChange(fn: (on: boolean) => void) {
  listeners.add(fn);
  load();
  if (player) fn(player.isEnabled());
  return () => {
    listeners.delete(fn);
  };
}
