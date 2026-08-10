# Migrazione al piano dei conti WEISS v4 — tabella di mappatura

Generato da `scripts/piano-v4/02-report-mappatura.ts` il 2026-08-10T21:59:34.653Z.

> I conteggi qui sotto sono la fotografia del database indicato, presa nel momento indicato. Se fra questa lettura e l'esecuzione della migrazione qualcuno registra qualcosa, i numeri cambiano: le guardie dello script 03 ricontano comunque tutto prima di scrivere.

- Database letto: `(bersaglio remoto — coordinate omesse: questo documento è tracciato dal repository)`
- Conti non-v4 esaminati: **23**
- Voci del piano v4 già presenti: **0** (attese 155 dopo la migrazione)
- Da disattivare: **17** · da conservare: **6** · bloccanti: **0**

## Tabella

| Code | Nome | Tipo | Rif. duri | Rif. morbidi | Dettaglio riferimenti | Azione proposta | Voce v4 equivalente | Note |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| `400` | Ricavi | RICAVO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 10.01 — Corrispettivi | 1 riga di budget: la migrazione la cancella |
| `400.01` | Ricavi da vendite bar | RICAVO | 0 | 1 | account_budget_mappings.account_id: 1 | disattivare | 10.01 — Corrispettivi | mappatura budget: la migrazione la cancella |
| `400.02` | Ricavi da vendite caffetteria | RICAVO | 0 | 0 | nessuno | disattivare | 10.01 — Corrispettivi | — |
| `400.03` | Ricavi da eventi | RICAVO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 11.01 — Ricavi eventi serali (ingressi e consumazioni) | 1 riga di budget: la migrazione la cancella |
| `500` | Costi | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `500.01` | Acquisti materie prime | COSTO | 0 | 2 | account_budget_mappings.account_id: 1; budget_lines.account_id: 1 | disattivare | 20.4.01 — Beni alimentari e gastronomia | 1 riga di budget: la migrazione la cancella; mappatura budget: la migrazione la cancella |
| `500.02` | Acquisti bevande | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 20.2.01 — Bibite e soft drink | 1 riga di budget: la migrazione la cancella |
| `510` | Costi personale | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 28.4.05 — Altri costi per personale dipendente | 1 riga di budget: la migrazione la cancella |
| `510.01` | Stipendi dipendenti | COSTO | 0 | 2 | account_budget_mappings.account_id: 1; budget_lines.account_id: 1 | disattivare | 28.1.01 — Retribuzioni personale dipendente serale | 1 riga di budget: la migrazione la cancella; mappatura budget: la migrazione la cancella |
| `510.02` | Compensi extra | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 28.1.02 — Retribuzioni personale extra e a chiamata | 1 riga di budget: la migrazione la cancella |
| `520` | Costi per servizi | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `520.01` | Pulizie | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 23.03 — Servizi di pulizia esterni | 1 riga di budget: la migrazione la cancella |
| `520.02` | Utenze | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 22.01 — Energia elettrica | 1 riga di budget: la migrazione la cancella |
| `520.03` | Manutenzioni | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 23.01 — Manutenzioni e riparazioni | 1 riga di budget: la migrazione la cancella |
| `530` | Costi amministrativi | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `530.01` | Commissioni bancarie | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 32.2.01 — Spese di tenuta conto e servizi bancari | 1 riga di budget: la migrazione la cancella |
| `530.02` | Commissioni POS | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 32.3.01 — Commissioni Pagobancomat | 1 riga di budget: la migrazione la cancella |
| `100` | Cassa | ATTIVO | 0 | 0 | nessuno | conservare (conto di sistema CASSA) | — (il piano v4 copre solo il conto economico) | — |
| `110` | Banca | ATTIVO | 0 | 0 | nessuno | conservare (conto di sistema BANCA) | — (il piano v4 copre solo il conto economico) | — |
| `120` | POS Worldline da accreditare | ATTIVO | 0 | 0 | nessuno | conservare (conto di sistema POS_WORLDLINE) | — (il piano v4 copre solo il conto economico) | — |
| `121` | POS Axerve da accreditare | ATTIVO | 0 | 0 | nessuno | conservare (conto di sistema POS_AXERVE) | — (il piano v4 copre solo il conto economico) | — |
| `122` | POS SumUp da accreditare | ATTIVO | 0 | 0 | nessuno | conservare (conto di sistema POS_SUMUP) | — (il piano v4 copre solo il conto economico) | — |
| `200` | Debiti v/fornitori | PASSIVO | 0 | 0 | nessuno | conservare (conto di sistema DEBITI_FORNITORI) | — (il piano v4 copre solo il conto economico) | — |

## Come leggere le colonne

**Riferimenti duri** — righe che imputano davvero il conto: disattivarlo falserebbe scritture esistenti. La migrazione si rifiuta di partire se ne trova anche uno solo. Sono:
- `journal_entries.account_id`
- `journal_entries.counterpart_id`
- `journal_entry_allocations.account_id`
- `invoice_line_accounts.account_id`
- `supplier_product_accounts.account_id`

**Riferimenti morbidi** — preferenze e configurazioni: sopravvivono alla disattivazione del conto (che resta in tabella, solo non selezionabile) ma vanno rivisti a mano, altrimenti puntano a un conto inattivo. Sono:
- `daily_expenses.account_id`
- `electronic_invoices.account_id`
- `suppliers.default_account_id`
- `customers.default_account_id`
- `categorization_rules.account_id`
- `schedule_rules.conto_id`
- `recurring_expenses.account_id`
- `account_budget_mappings.account_id`
- `budget_lines.account_id`

**Voce v4 equivalente** — dove marcata *(suggerito)* è un accostamento automatico per somiglianza dei nomi, da confermare. Le corrispondenze approvate si scrivono in `EQUIVALENZE_MANUALI` dentro lo script 02 e da lì finiscono in questa tabella senza il marcatore.

## Cosa fa poi la migrazione

`scripts/piano-v4/03-migrate.ts`, in una sola transazione:

1. inserisce (o aggiorna l'anagrafica del)le 155 voci del piano v4;
2. assegna `system_key = CORRISPETTIVI` alla voce `10.01`, così le chiusure di cassa nascono già imputate;
3. porta a `is_active = false` i conti legacy RICAVO/COSTO elencati sopra come «disattivare» — non li cancella;
4. cancella le righe di budget e le mappature budget dei conti legacy (disattivabile con `--mantieni-budget`);
5. scrive un audit log riepilogativo.

Prima di scrivere ricontrolla tutte le premesse: se anche una sola non regge, la transazione non parte e nulla viene toccato.

## I comandi, in ordine

> ⚠️ **`DATABASE_URL` va indicata sempre, esplicitamente, davanti a ogni comando.** Gli script caricano il `.env` del progetto quando la variabile non c'è, e quel `.env` punta alla produzione: lanciare un comando "nudo" dalla radice significa operare sulla produzione senza averlo deciso. Prima di scrivere su un bersaglio non locale lo script chiede di ribattere a mano la sua identità completa — nella forma `utente@nomedb su host:porta`, che lo script stampa a schermo subito sopra la domanda — ma è una rete di sicurezza, non il modo di lavorare.

> 🔐 **La stringa di connessione non va battuta sulla riga di comando.** Contiene la password di produzione, e tutto ciò che si scrive al prompt finisce in `~/.zsh_history` in chiaro, dove resta. Si legge senza eco, oppure da un file con i permessi stretti.

```bash
# il bersaglio, una volta sola, senza lasciarne traccia nella history
read -rs "DB_BERSAGLIO?URL di connessione: " && export DB_BERSAGLIO   # zsh
# read -rsp "URL di connessione: " DB_BERSAGLIO && export DB_BERSAGLIO  # bash

# in alternativa, da un file leggibile solo dal proprietario:
#   umask 077 && $EDITOR ~/.weiss-migrazione   (una riga: postgresql://…)
#   export DB_BERSAGLIO="$(cat ~/.weiss-migrazione)"

# 1. rigenera questa tabella contro il database che si vuole migrare (sola lettura)
DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/02-report-mappatura.ts \
  --out docs/migrazione-piano-conti-v4.md

# 2. STOP: far approvare la tabella. Poi il dry-run, che salva lo snapshot del rollback
DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/03-migrate.ts

# 3. esecuzione vera: se il bersaglio è remoto chiede di ribattere la sua
#    identità completa, "utente@nomedb su host:porta", stampata sopra la domanda
DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/03-migrate.ts --execute

# 4. verifica
DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/verifica.ts

# 5. solo se serve tornare indietro (lo snapshot lo stampa lo script 03)
DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/04-rollback.ts \
  --snapshot scripts/piano-v4/snapshots/<file>.json
DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/04-rollback.ts \
  --snapshot scripts/piano-v4/snapshots/<file>.json --execute
```

Anche esportata, la URL resta nell'ambiente del processo e chi ha lo stesso utente può leggerla con `ps eww`. È un passo avanti rispetto alla history, che è permanente, non una segregazione: chiusa la sessione, `unset DB_BERSAGLIO`.

Gli snapshot restano fuori dal repository (sono dati veri) ma vanno conservati: senza lo snapshot il rollback non sa a quale stato tornare. Il rollback rifiuta uno snapshot preso da un bersaglio diverso da quello corrente (`--forza` per i casi legittimi, per esempio la stessa URL scritta in due modi) e rifiuta comunque, senza possibilità di forzatura, uno snapshot i cui conti non esistono in questo database.

## Da eseguire a gestionale fermo

La migrazione gira in una transazione `SERIALIZABLE`, quindi una scrittura concorrente non può infilarsi fra il controllo delle premesse e la disattivazione dei conti: al massimo la transazione viene annullata dal database con un errore di serializzazione, e in quel caso si rilancia. Resta comunque preferibile eseguirla con nessuno collegato: se il pooler in uso non accettasse il livello `SERIALIZABLE`, la finestra si riaprirebbe, e a gestionale fermo la questione non si pone.

