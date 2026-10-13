// Copies the deployed FxRateReceiver address into the workflow config.
// Usage: node set-receiver.mjs [network]   (default: monadTestnet)
import fs from "node:fs";
const network = process.argv[2] ?? "monadTestnet";
const dep = JSON.parse(fs.readFileSync(new URL(`../contracts/deployments/${network}.json`, import.meta.url)));
const path = new URL("./spraycash-fx/config.staging.json", import.meta.url);
const cfg = JSON.parse(fs.readFileSync(path));
cfg.evm.receiverAddress = dep.fx;
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
console.log(`receiverAddress = ${dep.fx}`);
