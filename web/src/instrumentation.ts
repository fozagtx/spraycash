export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startRateRefresher } = await import("./lib/rate-refresher");
  startRateRefresher();
}
