"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, LocalAccount } from "viem";
import {
  createPasskey,
  ensureUnlocked,
  getAccount,
  hasStoredPasskey,
  isUnlocked,
  knownAddress,
  passkeyErrorMessage,
  unlockPasskey,
  type AccountScope,
} from "./passkey";

/**
 * A passkey-backed account for one scope (the employer, or a freelancer's account for one client).
 * `address` is available without a prompt once this device has used the account before;
 * `withAccount` prompts for Face ID / fingerprint only when a signature is actually needed.
 */
export function usePasskeyAccount(scope: AccountScope | null) {
  const scopeKey = scope ? (scope.kind === "employer" ? "employer" : `client:${scope.employer}`) : null;
  const [address, setAddress] = useState<Address | undefined>();
  const [hasPasskey, setHasPasskey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHasPasskey(hasStoredPasskey());
    if (scope) setAddress(isUnlocked() ? getAccount(scope).address : knownAddress(scope));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(undefined);
      try {
        await fn();
        if (scope) setAddress(getAccount(scope).address);
        setHasPasskey(hasStoredPasskey());
        return true;
      } catch (e) {
        setError(passkeyErrorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  const create = useCallback((displayName: string) => run(() => createPasskey(displayName)), [run]);
  const unlock = useCallback(() => run(() => unlockPasskey()), [run]);
  const signIn = useCallback((displayName: string) => run(() => ensureUnlocked(displayName)), [run]);

  /** Runs `fn` with the signing account, unlocking the passkey first if needed. */
  const withAccount = useCallback(
    async <T,>(fn: (account: LocalAccount) => Promise<T>, displayName = "Spraycash account"): Promise<T> => {
      if (!scope) throw new Error("No account");
      await ensureUnlocked(displayName);
      const account = getAccount(scope);
      setAddress(account.address);
      setHasPasskey(true);
      return fn(account);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  return { address, hasPasskey, busy, error, setError, ready, create, unlock, signIn, withAccount };
}
