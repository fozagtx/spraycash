"use client";

import { useState } from "react";
import { Spinner } from "./ui";

export function SignInCard({
  title,
  subtitle,
  askName,
  namePlaceholder = "Acme Studio",
  hasPasskey,
  busy,
  error,
  onCreate,
  onUnlock,
}: {
  title: string;
  subtitle: string;
  askName?: boolean;
  namePlaceholder?: string;
  hasPasskey: boolean;
  busy: boolean;
  error?: string;
  onCreate: (name: string) => void;
  onUnlock: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="card card-hero stack-lg" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="stack">
        <h2 className="display">{title}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {subtitle}
        </p>
      </div>
      {hasPasskey ? (
        <button className="btn btn-accent btn-block" onClick={onUnlock} disabled={busy}>
          {busy ? <Spinner /> : null} Continue with passkey
        </button>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(name.trim());
          }}
        >
          {askName && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="biz">Business name</label>
              <input
                id="biz"
                className="input"
                placeholder={namePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="organization"
              />
            </div>
          )}
          <button className="btn btn-accent btn-block" type="submit" disabled={busy}>
            {busy ? <Spinner /> : null} Create passkey
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={onUnlock} disabled={busy}>
            I already have a Spraycash passkey
          </button>
        </form>
      )}
      {error && <div className="notice notice-danger">{error}</div>}
      <p className="small muted" style={{ margin: 0 }}>
        Your passkey stays on your device and unlocks with Face ID, your fingerprint or your screen lock. There&apos;s
        nothing to write down.
      </p>
    </div>
  );
}
