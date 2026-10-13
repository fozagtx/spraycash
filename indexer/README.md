# Spraycash indexer (Envio HyperIndex)

Indexes payslips, withdrawals, refunds and every Chainlink CRE rate update on Monad testnet,
for payroll history and receipts.

```bash
# 1. Put the deployed addresses + startBlock from contracts/deployments/monadTestnet.json into config.yaml
pnpm install
pnpm codegen
pnpm dev        # local Postgres + GraphQL at http://localhost:8080
```

Example query:

```graphql
{ Payslip(order_by: { createdAt: desc }) { id currency deposit withdrawn status withdrawals { amount txHash } } }
```

Run it against the local Hardhat chain (addresses from `contracts/deployments/localhost.json`):

```bash
npx envio dev --config config.local.yaml
```

The web app reads withdrawal history from it through `/api/history` (endpoint set in `web/src/lib/config.ts`) and falls back to direct contract reads when the indexer is down. It has not been run against live Monad testnet yet.
