#!/bin/zsh
# Gate completo del ramo di integrazione.
#
# NON usa `set -e`: in questo ambiente non interrompe la catena (verificato:
# dopo un `false` i comandi successivi vengono eseguiti lo stesso). Ogni passo
# viene quindi controllato esplicitamente sul proprio codice di uscita, e alla
# fine si stampa un verdetto unico. Senza questo, un passo rosso seguito da un
# "build: OK" si legge come un gate verde.

WT=${1:-$HOME/Desktop/accounting-wt/integrazione}
SUFFISSO=${2:-int}

cd "$WT" || exit 2
source ~/.nvm/nvm.sh >/dev/null 2>&1
nvm use 22 >/dev/null 2>&1

FALLITI=()

passo() {
  local nome="$1"; shift
  local out
  out=$("$@" 2>&1)
  local codice=$?
  local pulito=${out//$'\e'\[[0-9;]*m/}
  if [ $codice -ne 0 ]; then
    FALLITI+=("$nome")
    print "✗ $nome (uscita $codice)"
    print "$pulito" | tail -15
  else
    print "✓ $nome"
    print "$pulito" | grep -E 'Test Files|Tests |problems|ratchet|Compiled' | tail -2
  fi
}

print "=== gate su $WT ==="
passo 'tsc'           npx tsc --noEmit
passo 'lint'          npm run lint
passo 'test unit'     npm run test:run
TEST_DB_SUFFIX=$SUFFISSO passo 'test integrazione' npm run test:integration
passo 'ratchet strict' node scripts/strict-ratchet.mjs
passo 'ratchet audit'  node scripts/audit-ratchet.mjs
passo 'build'          npm run build

print ""
if [ ${#FALLITI[@]} -eq 0 ]; then
  print "=== GATE VERDE: tutti e 7 i passi superati ==="
  exit 0
else
  print "=== GATE ROSSO: falliti ${#FALLITI[@]} passi → ${FALLITI[*]} ==="
  exit 1
fi
