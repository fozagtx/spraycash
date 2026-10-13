#!/usr/bin/env bash
# Keeps the Payday FX workflow writing fresh rates to Monad testnet during judging.
# Runs `cre workflow simulate --broadcast` once a minute and appends logs (with tx hashes) to logs/.
# Usage: cd cre && ./run-loop.sh        (needs the CRE CLI, `cre login`, and CRE_ETH_PRIVATE_KEY in .env)
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p logs
INTERVAL="${INTERVAL:-60}"
while true; do
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "=== $ts ===" | tee -a logs/simulate.log
  cre workflow simulate payday-fx \
    --target "${CRE_TARGET:-staging-settings}" \
    --non-interactive --trigger-index 0 \
    --broadcast 2>&1 | tee -a logs/simulate.log
  sleep "$INTERVAL"
done
