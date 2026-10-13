export type IndexedWithdrawal = { amount: string; localAmount: string; timestamp: number; txHash: string };

/** Withdrawals for a payslip from the Envio indexer, or null when the indexer is unavailable. */
export async function fetchWithdrawals(id: bigint): Promise<IndexedWithdrawal[] | null> {
  try {
    const res = await fetch(`/api/history?payslip=${id}`, { cache: "no-store" });
    const json = await res.json();
    return Array.isArray(json.withdrawals) ? json.withdrawals : null;
  } catch {
    return null;
  }
}
