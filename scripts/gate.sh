#!/bin/zsh
# Gate completo del ramo di integrazione.
#
# NON usa `set -e`: in questo ambiente non interrompe la catena (verificato:
# dopo un `false` i comandi successivi vengono eseguiti lo stesso). Ogni passo
# viene quindi controllato esplicitamente sul proprio codice di uscita, e alla
# fine si stampa un verdetto unico. Senza questo, un passo rosso seguito da un
# "build: OK" si legge come un gate verde.

# Il worktree è OBBLIGATORIO e non ha un valore predefinito. Averlo avuto è
# costato un incidente reale il 7 ago 2026: un agente ha lanciato lo script
# senza argomenti dal proprio worktree, e il gate è andato a fare `npm ci` nel
# worktree di integrazione, dove è fallito a metà lasciando le dipendenze
# incoerenti. Il guasto sembra un difetto del codice e sta invece in una
# cartella che non stavi guardando.
if [ -z "$1" ]; then
  print -u2 "uso: gate.sh <percorso-del-worktree> [suffisso-db]"
  print -u2 "esempio: ./scripts/gate.sh . int"
  print -u2 "Il percorso è obbligatorio di proposito: vedi il commento qui sopra."
  exit 2
fi

WT=$1
SUFFISSO=${2:-int}
DA=$PWD

cd "$WT" || exit 2
[ "$PWD" != "$DA" ] && print "nota: il gate gira su $PWD, non su $DA"
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
# Sempre per primo: un merge che tocca package.json lascia node_modules indietro
# rispetto al lockfile, e tutto ciò che viene dopo misura un ambiente sbagliato.
# Sintomo tipico: "Cannot find module '<pacchetto appena aggiunto>'".
passo 'npm ci'        npm ci
passo 'prisma generate' npx prisma generate
passo 'tsc'           npx tsc --noEmit
passo 'lint'          npm run lint
passo 'test unit'     npm run test:run
TEST_DB_SUFFIX=$SUFFISSO passo 'test integrazione' npm run test:integration
passo 'ratchet strict' node scripts/strict-ratchet.mjs
passo 'ratchet audit'  node scripts/audit-ratchet.mjs
passo 'build'          npm run build

print ""
if [ ${#FALLITI[@]} -eq 0 ]; then
  print "=== GATE VERDE: tutti i passi superati ==="
  exit 0
else
  print "=== GATE ROSSO: falliti ${#FALLITI[@]} passi → ${FALLITI[*]} ==="
  exit 1
fi
