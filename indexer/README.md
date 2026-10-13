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

Codegen and typecheck pass (`npx envio codegen && npx tsc --noEmit`); it has not been run against live Monad testnet yet.
