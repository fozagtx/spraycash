export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startFundsTopUp } = await import("./lib/test-funds");
  startFundsTopUp();
  const { startRateRefresher } = await import("./lib/rate-refresher");
  startRateRefresher();
}
