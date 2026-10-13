import { indexer } from "envio";

const currencyCode = (key: string) =>
  Buffer.from(key.slice(2), "hex").toString("utf8").replace(/\0+$/, "");

indexer.onEvent({ contract: "SpraycashPayroll", event: "PayslipCreated" }, async ({ event, context }) => {
  context.Payslip.set({
    id: event.params.id.toString(),
    employer: event.params.employer,
    freelancer: undefined,
    currency: currencyCode(event.params.currency),
    lockedRate: event.params.lockedRate,
    deposit: event.params.deposit,
    start: event.params.start,
    end: event.params.end,
    claimDeadline: event.params.claimDeadline,
    withdrawn: 0n,
    refunded: 0n,
    status: "unclaimed",
    createdAt: event.block.timestamp,
    fundingTx: event.transaction.hash,
  });
  const stats = await context.EmployerStats.get(event.params.employer);
  context.EmployerStats.set({
    id: event.params.employer,
    payslips: (stats?.payslips ?? 0) + 1,
    funded: (stats?.funded ?? 0n) + event.params.deposit,
    refunded: stats?.refunded ?? 0n,
  });
});

indexer.onEvent({ contract: "SpraycashPayroll", event: "PayslipClaimed" }, async ({ event, context }) => {
  const p = await context.Payslip.get(event.params.id.toString());
  if (p) context.Payslip.set({ ...p, freelancer: event.params.freelancer, status: "streaming" });
});

indexer.onEvent({ contract: "SpraycashPayroll", event: "Withdrawn" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const p = await context.Payslip.get(id);
  if (p) context.Payslip.set({ ...p, withdrawn: p.withdrawn + event.params.amount });
  context.Withdrawal.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    payslip_id: id,
    freelancer: event.params.freelancer,
    amount: event.params.amount,
    localAmount: event.params.localAmount,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "SpraycashPayroll", event: "PayslipStopped" }, async ({ event, context }) => {
  const p = await context.Payslip.get(event.params.id.toString());
  if (!p) return;
  context.Payslip.set({ ...p, refunded: p.refunded + event.params.refunded, status: "stopped" });
  const stats = await context.EmployerStats.get(p.employer);
  if (stats) context.EmployerStats.set({ ...stats, refunded: stats.refunded + event.params.refunded });
});

indexer.onEvent({ contract: "SpraycashPayroll", event: "UnclaimedRefunded" }, async ({ event, context }) => {
  const p = await context.Payslip.get(event.params.id.toString());
  if (!p) return;
  context.Payslip.set({ ...p, refunded: p.refunded + event.params.refunded, status: "refunded" });
  const stats = await context.EmployerStats.get(p.employer);
  if (stats) context.EmployerStats.set({ ...stats, refunded: stats.refunded + event.params.refunded });
});

indexer.onEvent({ contract: "FxRateReceiver", event: "RateUpdated" }, async ({ event, context }) => {
  context.RateUpdate.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    currency: currencyCode(event.params.currency),
    value: event.params.value,
    sources: Number(event.params.sources),
    observedAt: event.params.observedAt,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});
