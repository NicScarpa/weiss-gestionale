#!/bin/zsh
# Baseline oggettiva — audit weiss-gestionale (Fase 1)
source ~/.nvm/nvm.sh
nvm use 22
cd /Users/nicolascarpa/Desktop/accounting
LOG=audit/baseline-logs
: > $LOG/_summary.txt

run() {
  local name=$1; shift
  echo "--- $name start $(date +%H:%M:%S)"
  local start=$(date +%s)
  "$@" > $LOG/$name.log 2>&1
  local code=$?
  local end=$(date +%s)
  echo "$name|exit=$code|secs=$((end-start))" | tee -a $LOG/_summary.txt
}

run 01-npm-ci npm ci
run 02-prisma-generate npx prisma generate
run 03-tsc npx tsc --noEmit
run 04-tsc-strict npx tsc --noEmit -p tsconfig.strict.json
run 05-lint npm run lint
run 05b-eslint-dot npx eslint src
run 06-test npm run test:run
run 07-coverage npm run test:coverage
run 08-build npm run build
run 09-npm-audit npm audit --audit-level=high
run 10-depcheck npx --yes depcheck
run 11-knip npx --yes knip
echo "DONE" >> $LOG/_summary.txt
