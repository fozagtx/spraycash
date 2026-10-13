# Spraycash: handoff

Status of every requirement in the PRD (Monad Metropolis, Track 2), what was verified, and what is left.
Branch: `claude/zealous-hypatia-u61dvz`.

**Short version:** all P0 features are built and pass an end-to-end run on a local chain.
**Deployed to Monad testnet** (addresses in `contracts/deployments/monadTestnet.json` and the README). The full
employer and freelancer flow passes against it. `FxRateReceiver` still has the deployer as its forwarder, so rates are
pushed with `npm run push-rate:monad` until it is pointed at the CRE forwarder with `setForwarder`.

---

## 1. Requirements

Legend: ✅ done and tested · 🟡 done, not yet verified on live testnet · ❌ not done

### P0 (must ship)

| Requirement | Status | Where | How it was verified |
|---|---|---|---|
| Mera passkey sign-in (employer and freelancer) | ✅ | `web/src/lib/passkey.ts`, `web/src/lib/useAccount.ts`, `web/src/components/SignInCard.tsx` | e2e with Chromium virtual authenticator (PRF on) |
| FX quote card from on-chain CRE reports, with freshness indicator | ✅ | `web/src/components/QuoteCard.tsx` | e2e: "updated Ns ago", "Verified by Chainlink", 5-second lock ring |
| Create payslip: per-second stream, locked rate, funded escrow | ✅ | `contracts/contracts/SpraycashPayroll.sol` (`createPayslipWithPermit`) | contract tests + e2e |
| Claim link binding the freelancer's passkey account, gasless | ✅ | `web/src/app/claim/[id]`, `SpraycashPayroll.claim`, `web/src/app/api/relay` | tests (wrong-account signature rejected) + e2e |
| Live ticking balance in local currency, plus withdraw | ✅ | `web/src/app/payslip/[id]`, `web/src/components/HeroAmount.tsx` | e2e: ₹ value increases between samples; withdraw succeeds with zero gas balance |
| Stop payslip (earned stays, unearned refunds) | ✅ | `SpraycashPayroll.stop`, employer dashboard | tests (exact split) + e2e |
| Receipt page with explorer links | ✅ | `web/src/app/receipt/[hash]` | e2e: Verify links for withdrawal, funding, rate report, AUSD |
| CRE workflow running on a loop (`simulate --broadcast`) | 🟡 | `cre/spraycash-fx/main.ts`, `cre/run-loop.sh` | unit tests, typecheck and WASM compile pass; **not run with the CRE CLI** (not installable in sandbox) |

### Failure paths (PRD §6, must be in the demo)

| Case | Status | Behaviour |
|---|---|---|
| Stale rate (>10 min) | ✅ | Pay disabled with "Rate refreshing…"; contract reverts `StaleRate` |
| Employer stops pay | ✅ | Earned stays withdrawable; unearned refunded instantly |
| Bad or expired link | ✅ | Clear message; employer gets a Refund button after expiry (`refundUnclaimed`) |
| Over budget | ✅ | Pay disabled with message; contract reverts `InsufficientBalance` |
| Rate changed while confirming (extra) | ✅ | Contract reverts `QuoteChanged`; UI asks to review the new rate |

### P1 (if time allows)

| Requirement | Status | Where / notes |
|---|---|---|
| Envio indexer for dashboard and history | 🟡 | `indexer/`: runs against the local chain (`config.local.yaml`) and feeds payslip withdrawal history via `/api/history`; not run against testnet yet; the app falls back to contract reads |
| Multiple clients per freelancer, separate accounts from one passkey | ✅ | HKDF `client:<employer>` derivation; "My pay" page (`web/src/app/me`) lists each account |
| CSV export of payslips | ❌ | Not built |

### Cut (roadmap only, as planned)

CCIP funding, off-ramp to bank / mobile money, invoices, tax forms, mobile app. None built.

### Copy rule ("never say blockchain, wallet, crypto, token, gas, seed phrase")

✅ Searched all UI files (`web/src/app`, `web/src/components`) and found no matches. The only exception is the
word "token" inside code comments, which users never see.

### Design spec (PRD §9)

✅ Light mode only, the PRD color tokens, Instrument Serif / Geist / Geist Mono, 14px radius, 1px borders,
one soft shadow on the hero card, a ticking hero number with "≈ $… · rate locked", a live dot, a quote card
with lock ring, a perforated paper receipt, round flag chips, 1080px max width, and mobile-first freelancer pages.

### Branding

✅ Named **Spraycash** throughout. Logo: a dollar coin with spray droplets (`web/src/components/Logo.tsx`,
`web/src/app/icon.svg`, `docs/logo.svg`). Landing page rebuilt (hero, currencies, before/after, how it works,
audiences, receipt proof, FAQ, CTA).

---

## 2. Sponsor bounties

| Bounty | Claim | Strength |
|---|---|---|
| **Agora**, Best Cross-Border Payments App ($10k) | Payroll is escrowed, streamed and withdrawn in **AUSD** on Monad testnet; funding uses one gasless EIP-2612 permit; "Add funds" uses Agora's AUSD faucet; receipts say "Paid in AUSD by Agora" | Good once deployed. **Bounty rules not found online**, so check them |
| **Chainlink CRE** ($3k) | 2 sources → median → reject >1% → DON median consensus → signed report → forwarder-only receiver with replay protection and optional workflow-owner check | Strong in code; needs simulate logs with tx hashes |
| **Mera**, Best UX ($2.5k) | Face ID for both sides, no seed phrase, no crypto words, gasless | Strong |
| **Mera**, One Passkey, Many Keys ($2.5k) | One PRF secret → HKDF → separate account per client; "My pay" shows them | Strong |
| **Envio** ($1k) | HyperIndex for payslips, withdrawals, refunds, rate updates; powers payslip withdrawal history | Medium (live locally, not on testnet) |
| Alchemy (credits) | RPC via env vars | Weak, don't lead with it |

---

## 3. Verification snapshot

| Check | Command | Result |
|---|---|---|
| Contract tests | `cd contracts && npm test` | 12 passing |
| CRE logic tests | `cd cre/spraycash-fx && bun test` | 5 passing |
| CRE compile | `bun x cre-compile main.ts out.wasm` | compiles (≈2.9 MB WASM) |
| Web typecheck + build | `cd web && npx tsc --noEmit && npm run build` | passes |
| Indexer | `cd indexer && npx envio codegen && npx tsc --noEmit` | passes |
| End to end | `web/e2e/flow.cjs` (local Hardhat node, chain id 31337) | all steps pass |

The e2e covers: employer passkey sign-up → add funds → payslip via permit at a locked rate → claim link →
freelancer passkey (separate device) → live ticking → gasless withdraw → receipt → stop → bad / used /
wrong-key links → expired link refund → stale rate blocks Pay.

Everything above ran against a **local chain with the SpraycashUSD stand-in** (which has the same permit as AUSD),
not against real AUSD.

---

## 4. Known risks and assumptions

1. **AUSD permit (most important).** Funding assumes AUSD supports EIP-2612 `permit`. One public project says
   AUSD supports EIP-3009 (`receiveWithAuthorization`). If permit isn't supported, the contract's permit call
   fails silently and `createPayslip` then fails on allowance. Test this first after deploy. The fix is to
   switch to EIP-3009 or `approve` via the relayer pattern.
2. **AUSD addresses.** Token `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` and faucet
   `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` (`requestFunds(address)`, 10,000 per call, about one a minute) came
   from Agora's deployments page via search; the faucet address was only shown shortened elsewhere. Check both
   on testnet.monadscan.com. The deploy script checks that the token has 6 decimals.
3. **CRE CLI flags.** `run-loop.sh` uses `--non-interactive --trigger-index 0 --broadcast`. These are unverified,
   so run one simulate by hand first.
4. **CRE forwarder address.** `FxRateReceiver` only accepts the forwarder set at deploy (`CRE_FORWARDER_ADDRESS`).
   Use the MockKeystoneForwarder for `monad-testnet` from the CRE forwarder directory, or reports will revert.
5. **RPC log limits.** Verify links run single-block `getLogs` queries. Fine in theory, but untested on Monad's RPC.
6. **Passkeys on real phones.** Only tested with a virtual authenticator. PRF needs recent Chrome or Safari 18+ / iOS 18+.
   There's no Privy fallback.
7. **Relayer.** One funded key, allowlisted calls, no rate limiting.
8. **NGN** is single-source (the ECB doesn't publish it) and is labelled so in the UI.

---

## What's left, in order

1. **Deploy contracts** (needs testnet MON):
   ```bash
   cd contracts
   export DEPLOYER_PRIVATE_KEY=0x...
   export CRE_FORWARDER_ADDRESS=0x...   # CRE forwarder for monad-testnet
   npm run deploy:monad && npm run export-abi
   ```
2. **Start the FX loop:** `cd cre && node set-receiver.mjs && cp .env.example .env` (add `CRE_ETH_PRIVATE_KEY`),
   run `cre workflow simulate spraycash-fx --target staging-settings --broadcast` once, then `./run-loop.sh`.
3. **Web on Vercel:** env from `web/.env.example` (AUSD and faucet are prefilled) plus the deployed addresses and
   a funded `RELAYER_PRIVATE_KEY` (server-only).
4. **Smoke test on testnet:** Add funds (Agora faucet) → create a payslip (**confirms the AUSD permit**) → claim on a
   phone with Face ID → withdraw → open receipt Verify links.
5. **Evidence packet:** fill README addresses, commit `cre/logs/simulate.log` excerpts with tx hashes, record the
   90-second demo (script in PRD §10), add the live URL.
6. **Optional:** run the Envio indexer (`indexer/`, fill addresses in `config.yaml`); CSV export (P1, not built).
7. **Check on hackathon.monad.xyz:** exact deadline, Agora bounty rules, community-team bounty eligibility.

### Demo shortcuts

- Stale rate on cue: owner calls `SpraycashPayroll.setMaxRateAge(30)`, then wait 30s.
- Expired link on cue: pick "10 minutes (demo)" for link expiry.
- Fast-moving numbers: any pay period works; the per-second rate is monthly ÷ 30 days.

## Repo map

```
contracts/   SpraycashPayroll, FxRateReceiver, SpraycashForwarder, SpraycashUSD (local stand-in), tests, deploy scripts
cre/         CRE project + spraycash-fx workflow, run-loop.sh, set-receiver.mjs
web/         Next.js app, /api/relay, /api/faucet, e2e/flow.cjs
indexer/     Envio HyperIndex config, schema, handlers
docs/        logo.svg, HANDOFF.md (this file)
```

## Commit history note

The first two commits (`8cca8c3`, `e5f4092`) still say "Payday" in their messages because they predate the
rename. Rewriting them needs a force push, which wasn't permitted in this session. The code is Spraycash
throughout.
