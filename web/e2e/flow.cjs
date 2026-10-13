const { chromium } = require("playwright");
const OUT = process.env.OUT_DIR || require("path").join(__dirname, "screenshots");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";

async function withAuthenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal",
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true, hasPrf: true,
    },
  });
}

async function rpc(method, params = []) {
  const r = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const log = (...a) => console.log("[e2e]", ...a);

  // ---------------- employer
  const emp = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const ep = await emp.newPage();
  ep.on("console", (m) => m.type() === "error" && console.log("[employer console]", m.text()));
  await withAuthenticator(emp, ep);
  await ep.goto(`${BASE}/`);
  await ep.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true });
  await ep.goto(`${BASE}/employer`);
  await ep.fill("#biz", "Acme Studio");
  await ep.click("text=Create passkey");
  await ep.waitForSelector("text=Payroll balance", { timeout: 30000 });
  log("employer signed in");
  await ep.click("text=Add demo funds");
  await ep.waitForSelector("text=Added $25,000", { timeout: 30000 });
  log("funded");
  await ep.screenshot({ path: `${OUT}/02-dashboard-empty.png`, fullPage: true });

  await ep.click("text=Pay a freelancer");
  await ep.fill("#name", "Priya Raman");
  await ep.fill("#amount", "125000");
  await ep.waitForSelector("button:has-text('Pay $')", { timeout: 15000 });
  await ep.screenshot({ path: `${OUT}/03-new-payslip.png`, fullPage: true });
  await ep.click("button:has-text('Pay $')");
  await ep.waitForSelector("text=their pay link", { timeout: 30000 });
  const link = await ep.textContent(".link-box code");
  log("claim link", link);
  await ep.screenshot({ path: `${OUT}/04-link.png`, fullPage: true });

  // ---------------- freelancer (separate device / passkey)
  const fr = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const fp = await fr.newPage();
  fp.on("console", (m) => m.type() === "error" && console.log("[freelancer console]", m.text()));
  await withAuthenticator(fr, fp);
  await fp.goto(link);
  await fp.waitForSelector("text=Continue with passkey");
  await fp.screenshot({ path: `${OUT}/05-claim.png`, fullPage: true });
  await fp.click("text=Continue with passkey");
  await fp.waitForURL(/\/payslip\//, { timeout: 30000 });
  await fp.waitForSelector("text=Ready to withdraw");
  await fp.waitForTimeout(4000);
  await fp.screenshot({ path: `${OUT}/06-live-payslip.png`, fullPage: true });
  const a = await fp.textContent(".hero-number");
  await fp.waitForTimeout(1500);
  const b = await fp.textContent(".hero-number");
  log("ticking", a, "->", b);
  await fp.click("button:has-text('Withdraw')");
  await fp.waitForURL(/\/receipt\//, { timeout: 30000 });
  await fp.waitForSelector("text=Payslip receipt", { timeout: 30000 });
  await fp.screenshot({ path: `${OUT}/07-receipt.png`, fullPage: true });
  log("receipt", await fp.textContent(".receipt .money"));

  // ---------------- employer dashboard + stop
  await ep.goto(`${BASE}/employer`);
  await ep.waitForSelector("text=Priya Raman");
  await ep.waitForTimeout(1500);
  await ep.screenshot({ path: `${OUT}/08-dashboard.png`, fullPage: true });
  await ep.click("button:has-text('Stop')");
  await ep.click("button:has-text('Stop pay')");
  await ep.waitForSelector("text=Pay stopped", { timeout: 30000 });
  await ep.screenshot({ path: `${OUT}/09-stopped.png`, fullPage: true });
  log("stopped");

  await fp.goto(link.replace(/\/claim\/(\d+).*/, "/payslip/$1"));
  await fp.waitForSelector("text=stopped pay");
  await fp.screenshot({ path: `${OUT}/10-freelancer-stopped.png`, fullPage: true });

  // ---------------- bad link
  const other = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await other.goto(link);
  await other.waitForSelector("text=already been used");
  await other.goto(`${BASE}/claim/99`);
  await other.waitForSelector("text=doesn't work");
  await other.goto(link.replace(/k=0x[0-9a-f]+/, "k=0x" + "22".repeat(32)));
  await other.waitForSelector("text=doesn't work");
  await other.screenshot({ path: `${OUT}/11-bad-link.png`, fullPage: true });
  log("bad links ok");

  // ---------------- expired link -> refund
  await ep.goto(`${BASE}/employer/new`);
  await ep.fill("#name", "Luis Ortega");
  await ep.click("button:has-text('Mexico')");
  await ep.click("button[aria-pressed]:has-text('USD')");
  await ep.fill("#amount", "2000");
  await ep.selectOption("#window", "600");
  await ep.waitForSelector("button:has-text('Pay $')", { timeout: 15000 });
  await ep.click("button:has-text('Pay $')");
  await ep.waitForSelector("text=their pay link", { timeout: 30000 });
  log("second payslip created");

  // ---------------- stale rate
  await rpc("evm_increaseTime", [700]);
  await rpc("evm_mine");
  await ep.goto(`${BASE}/employer/new`);
  await ep.fill("#name", "Luis Ortega");
  await ep.waitForSelector("text=Rate refreshing", { timeout: 15000 });
  await ep.screenshot({ path: `${OUT}/12-stale.png`, fullPage: true });
  const disabled = await ep.isDisabled("button:has-text('Rate refreshing')");
  log("stale pay disabled:", disabled);

  await ep.goto(`${BASE}/employer`);
  await ep.waitForSelector("text=Link expired");
  await ep.click("button:has-text('Refund')");
  await ep.waitForSelector("text=expired unused", { timeout: 30000 });
  await ep.screenshot({ path: `${OUT}/13-refunded.png`, fullPage: true });
  log("expired link refunded");

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
