# Migrazione al piano dei conti WEISS v4 — tabella di mappatura

Generato da `scripts/piano-v4/02-report-mappatura.ts` il 2026-08-07T20:40:32.335Z.

> ⚠️ **Documento generato su un database LOCALE di prova, non sulla produzione.** Codici, nomi e conteggi dei conti qui sotto sono quelli di quel database: servono a mostrare la forma del report e a provare il ciclo migrazione/rollback, non sono la fotografia della produzione. La tabella definitiva va rigenerata puntando `DATABASE_URL` alla produzione — lo script è di sola lettura — al momento dello STOP che precede l'esecuzione.

- Database letto: `nicolascarpa@weiss_t19 su 127.0.0.1:5433`
- Conti non-v4 esaminati: **20**
- Voci del piano v4 già presenti: **0** (attese 155 dopo la migrazione)
- Da disattivare: **17** · da conservare: **3** · bloccanti: **0**

## Tabella

| Code | Nome | Tipo | Rif. duri | Rif. morbidi | Dettaglio riferimenti | Azione proposta | Voce v4 equivalente | Note |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| `400` | Ricavi vendite | RICAVO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `400.01` | Ricavi bar | RICAVO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `400.02` | Ricavi cucina | RICAVO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `410` | Altri ricavi | RICAVO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `500` | Acquisti merci | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `500.01` | Acquisti bevande | COSTO | 0 | 2 | categorization_rules.account_id: 1; budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella; resta puntato da categorization_rules.account_id (1): rivedere a mano |
| `500.02` | Acquisti alimentari | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `510` | Costi del personale | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 28.4.05 — Altri costi per personale dipendente *(suggerito)* | 1 riga di budget: la migrazione la cancella |
| `510.01` | Stipendi dipendenti | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `520` | Utenze | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | — (da decidere) | 1 riga di budget: la migrazione la cancella |
| `520.01` | Energia elettrica | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 22.01 — Energia elettrica *(suggerito)* | 1 riga di budget: la migrazione la cancella |
| `520.02` | Gas metano | COSTO | 0 | 3 | suppliers.default_account_id: 1; account_budget_mappings.account_id: 1; budget_lines.account_id: 1 | disattivare | 22.02 — Gas da rete (metano) *(suggerito)* | 1 riga di budget: la migrazione la cancella; mappatura budget: la migrazione la cancella; resta puntato da suppliers.default_account_id (1): rivedere a mano |
| `520.03` | Acqua | COSTO | 0 | 1 | budget_lines.account_id: 1 | disattivare | 22.03 — Acqua *(suggerito)* | 1 riga di budget: la migrazione la cancella |
| `525` | Affitti passivi | COSTO | 0 | 0 | nessuno | disattivare | — (da decidere) | — |
| `530` | Servizi vari | COSTO | 0 | 0 | nessuno | disattivare | — (da decidere) | — |
| `530.01` | Pulizie | COSTO | 0 | 0 | nessuno | disattivare | — (da decidere) | — |
| `530.02` | Manutenzioni e riparazioni | COSTO | 0 | 0 | nessuno | disattivare | 23.01 — Manutenzioni e riparazioni *(suggerito)* | — |
| `100` | Cassa | ATTIVO | 0 | 0 | nessuno | conservare (conto di sistema CASSA) | — (il piano v4 copre solo il conto economico) | — |
| `110` | Banca | ATTIVO | 0 | 0 | nessuno | conservare (conto di sistema BANCA) | — (il piano v4 copre solo il conto economico) | — |
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

