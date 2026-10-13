<img src="docs/logo.svg" width="48" alt="Spraycash logo" />

# Spraycash

**Cross-border payroll for freelancers, paid by the second at a locked FX rate.**
Monad Metropolis · Track 2 (Consumer Products & Payments)

A US client funds payroll in AUSD, the dollar by Agora. A freelancer in Bangalore, Mexico City, Manila or Lagos opens a link,
signs in with Face ID, and watches their pay tick up **every second in their own currency**, at a rate that was
locked from a **Chainlink-verified** report the moment the client hit pay. Withdrawing is free, with no fees
or setup.

The product never says blockchain, wallet, crypto, token or gas. It says *account*, *dollars* and *pay*.

| | |
|---|---|
| Live URL | _TODO after Vercel deploy_ |
| Demo video | _TODO_ |
| Handoff / status | [docs/HANDOFF.md](docs/HANDOFF.md) |
| Contracts (Monad testnet) | see [Deployed addresses](#deployed-addresses) |

---

## How it works

```
 Employer (passkey)                       Freelancer (passkey, one account per client)
      │  sign request                              │  sign request
      ▼                                            ▼
 ┌─────────────── Next.js app + /api/relay (pays fees, can't change what was signed) ──────────────┐
 └───────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                 ▼  ERC-2771
                         SpraycashForwarder
                    ┌────────────┴─────────────┐
                    ▼                          ▼
              SpraycashPayroll ◄── getRate ── FxRateReceiver ◄── signed report ── Chainlink CRE workflow
        (escrow, per-second stream,                                         (cron 60s: frankfurter + er-api,
         locked rate, stop/refund)                                           median, reject >1% spread)
                    │
                 AUSD by Agora (SpraycashUSD stand-in only for local dev)
                    │
              Envio indexer (history: payslips, withdrawals, rate updates)
```

1. **Employer adds a freelancer:** name, country (INR / MXN / PHP / NGN), monthly pay, period, start date.
2. **Quote card** reads the latest CRE report on-chain and shows "1 USD = 83.42 INR · updated 12s ago · Verified by
   Chainlink" with a **5-second lock ring**. The contract re-checks the quote: if a newer report landed, the call reverts
   with `QuoteChanged` instead of silently re-pricing. If the report is older than 10 minutes, Pay is disabled
   ("Rate refreshing…") and calling the contract directly reverts with `StaleRate`.
3. **Confirm:** USD is escrowed and the payslip streams per second from the start time.
4. The **claim link** carries a one-time key in the URL fragment (never sent to a server). The freelancer's passkey
   derives an account for *this client*, the link key signs "bind payslip N to account X", and the relayer
   submits it. Nobody who sees the transaction can redirect the pay to another account.
5. **Live payslip:** a large Instrument Serif number ticking in rupees, "≈ $… USD · rate locked 83.42".
6. **Withdraw** any time. The **receipt** is a paper payslip with **Verify** links for the withdrawal, the funding
   transaction and the exact CRE rate report that was locked.

### Failure paths (all covered by tests and the e2e run)

| Case | What happens |
|---|---|
| Stale rate (>10 min) | Pay disabled with "Rate refreshing…"; contract reverts `StaleRate` |
| Rate changed mid-confirm | contract reverts `QuoteChanged`; UI asks to review the new rate |
| Employer stops pay | earned pay stays withdrawable by the freelancer; unearned refunds instantly |
| Bad link / wrong key | "This pay link doesn't work" |
| Link already used | "This pay link has already been used" |
| Link expired | freelancer is told; employer gets a **Refund** button that returns everything |
| Over budget | Pay disabled; contract reverts `InsufficientBalance` |

## Why Monad

- **Sub-second blocks** make a *firm* FX quote possible: lock for 5 seconds and settle before the next report,
  so no padded spread. They also let the balance visibly move every block.
- **Mera passkeys** (Monad Foundation / Category Labs): one passkey → WebAuthn PRF → HKDF → **a separate
  secp256k1 account per client** (`employer`, `client:<employer address>`). Income streams stay cleanly separated
  for accounting, behind one Face ID.
- **Chainlink CRE on Monad** brings off-chain FX on-chain as signed, checkable reports.

## Sponsor stack

| Sponsor | Where it carries weight | Code |
|---|---|---|
| **Agora**: cross-border payments | Payroll is escrowed, streamed and withdrawn in **AUSD** on Monad testnet (`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`). Employers fund with one gasless request using an EIP-2612 **permit** (`createPayslipWithPermit`), and "Add funds" calls **Agora's AUSD faucet** (`requestFunds`). Receipts show "Paid in AUSD by Agora" with a Verify link | `contracts/contracts/SpraycashPayroll.sol`, `web/src/lib/permit.ts`, `web/src/app/api/faucet` |
| **Chainlink CRE** | Cron workflow: 2 HTTP sources → median → reject >1% → DON consensus (median per field) → signed report → `FxRateReceiver.onReport` (forwarder-only, optional workflow-owner check, replay-safe) | `cre/spraycash-fx/` |
| **Mera**: best UX | Passkey sign-in for both sides; no seed phrase, no extension | `web/src/lib/passkey.ts` |
| **Mera**: one passkey, many keys | HKDF-derived account per client from one PRF secret; "My pay" shows each account | `web/src/lib/passkey.ts`, `web/src/app/me` |
| **Envio** | HyperIndex indexer for payslips, withdrawals, refunds and rate updates | `indexer/` |
| Alchemy | Monad RPC (URL in `web/src/lib/config.ts`) | |

## Repo layout

```
contracts/   Hardhat + viem. SpraycashPayroll, FxRateReceiver, SpraycashUSD, SpraycashForwarder + tests + deploy scripts
cre/         Chainlink CRE project (project.yaml) and the spraycash-fx TypeScript workflow
web/         Next.js 15 app: employer + freelancer flows, /api/relay, Playwright e2e (web/e2e/flow.cjs)
indexer/     Envio HyperIndex config, schema and handlers
```

## Setup

Requirements: Node 22, bun ≥ 1.2.21, the [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation),
and a funded Monad testnet key.

### 1. Contracts

```bash
cd contracts
npm install
npm test                         # 11 tests: streaming, quote lock, stale, stop/refund, expiry, gasless
export DEPLOYER_PRIVATE_KEY=0x...
export CRE_FORWARDER_ADDRESS=0x...   # CRE forwarder for monad-testnet (simulation uses the MockKeystoneForwarder;
                                     # see the CRE forwarder directory). Unset = deployer, for manual rate pushes.
npm run deploy:monad             # uses Agora AUSD on Monad testnet (checks it has 6 decimals);
                                 # USD_TOKEN=demo deploys the SpraycashUSD stand-in instead
                                 # writes deployments/monadTestnet.json
npm run export-abi               # regenerates web/src/lib/abi.ts
```

Demo tip: the owner can shorten the stale window to show the stale-rate path live:
`SpraycashPayroll.setMaxRateAge(30)` (bounds: 30s–1 day).

### 2. CRE workflow

```bash
cd cre
node set-receiver.mjs            # copies FxRateReceiver address into spraycash-fx/config.staging.json
cp .env.example .env             # CRE_ETH_PRIVATE_KEY = key that broadcasts the simulated write
cd spraycash-fx && bun install && bun test && bunx tsc --noEmit && cd ..
cre workflow simulate spraycash-fx --target staging-settings --broadcast
./run-loop.sh                    # re-runs simulate --broadcast every 60s, logs to cre/logs/simulate.log
```

The workflow compiles to WASM (`bun x cre-compile spraycash-fx/main.ts out.wasm`). The pure aggregation logic
(`fx.ts`) is unit-tested.

### 3. Web app + relayer

```bash
cd web
cp .env.example .env.local       # AUSD + Agora faucet addresses are prefilled; add the other addresses from
                                 # contracts/deployments/monadTestnet.json + RELAYER_PRIVATE_KEY
npm install
npm run dev                      # https required for passkeys anywhere except localhost
```

The relayer (`/api/relay`) only forwards a fixed allowlist of calls (`createPayslip`, `createPayslipWithPermit`, `claim`,
`withdraw`, `stop`, `refundUnclaimed`, plus the local stand-in's `faucet`) to the Spraycash contracts. It verifies the signed ERC-2771 request,
dry-runs the inner call to turn contract errors into plain-language messages, then submits.

Deploy to Vercel with the same env vars. `RELAYER_PRIVATE_KEY` must be a server-only variable.

### 4. Indexer (optional)

```bash
cd indexer && npm install && npx envio codegen && npx envio dev
```

## Testing

| Layer | Command | Status |
|---|---|---|
| Contracts | `cd contracts && npm test` | 12 passing (incl. gasless permit funding) |
| CRE logic | `cd cre/spraycash-fx && bun test` | 5 passing; typechecks; compiles to WASM |
| Web | `cd web && npm run build` | builds and typechecks |
| End to end | `web/e2e/flow.cjs` against a local Hardhat node (chain id via `NEXT_PUBLIC_CHAIN_ID=31337`) | passes |
| Indexer | `cd indexer && npx envio codegen && npx tsc --noEmit` | passes |

The e2e script drives two Chromium contexts, each with a **virtual WebAuthn authenticator with PRF**: employer
sign-up → demo funds → payslip at a locked rate → claim link → freelancer passkey → live ticking → gasless
withdraw → receipt → stop → bad links → expired link refund → stale rate blocks Pay.

Local run:

```bash
cd contracts && npx hardhat node &                       # terminal 1
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/push-rate.ts --network localhost # stands in for CRE locally
# web/.env.local: NEXT_PUBLIC_CHAIN_ID=31337, NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545, addresses, a funded RELAYER_PRIVATE_KEY
cd ../web && npm run dev &
NODE_PATH=$(npm root -g) node e2e/flow.cjs               # screenshots in web/e2e/screenshots
```

## Deployed addresses

Monad testnet (chain 10143), from `contracts/deployments/monadTestnet.json`:

| Contract | Address |
|---|---|
| SpraycashPayroll | [0x60a281101208e007dbdb0b90dae3f90ef214b962](https://testnet.monadexplorer.com/address/0x60a281101208e007dbdb0b90dae3f90ef214b962) |
| FxRateReceiver | [0x1331ded23217632b318b828040318ec510857a93](https://testnet.monadexplorer.com/address/0x1331ded23217632b318b828040318ec510857a93) |
| SpraycashForwarder | [0x29bde2292814d1e7df7ceb4af39f3d8cd3f8bae9](https://testnet.monadexplorer.com/address/0x29bde2292814d1e7df7ceb4af39f3d8cd3f8bae9) |
| AUSD (Agora, existing) | [0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC](https://testnet.monadexplorer.com/address/0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC) |

The web app uses these by default (`web/src/lib/config.ts`); env vars override them for a local chain.

CRE simulate logs with transaction hashes: `cre/logs/simulate.log`.

## Limitations

- **Testnet AUSD:** payroll uses Agora's test AUSD on Monad testnet, funded from Agora's faucet (10,000 per request, about one a minute). `SpraycashUSD` exists only as a local stand-in. There's no off-ramp to a bank or mobile money yet.
- **NGN is single-source:** the ECB (frankfurter.app) doesn't publish NGN, so NGN comes from open.er-api.com only
  and is labelled "single source" in the UI. INR, MXN and PHP require both sources to agree within 1%.
- **The relayer pays fees** from one funded key. It's allowlisted to Spraycash calls but not rate-limited.
- **The FX loop** runs as `cre workflow simulate --broadcast` on a machine we control, not a deployed DON
  workflow. If it stops, the UI shows the rate age and Pay locks after 10 minutes, by design.
- Names and claim links live in the employer's browser (localStorage). Money, rates and status are always
  read from the contracts.
- Passkeys need WebAuthn PRF (recent Chrome, Safari 18+, iOS 18+, Android 9+). The fallback is a clear error
  message; Privy wasn't integrated.

## Roadmap

CCIP funding from other chains · off-ramp to local bank / UPI / SPEI / mobile money · invoices · tax forms ·
CSV export · mobile app.
