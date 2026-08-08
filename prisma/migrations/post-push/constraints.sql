-- =============================================================================
-- Vincoli di unicità che Prisma non sa esprimere (indici PARZIALI)
-- =============================================================================
--
-- Perché questo file esiste
-- -------------------------
-- Il gestionale applica lo schema con `prisma db push`, ma Prisma non esprime
-- gli indici parziali (`CREATE UNIQUE INDEX ... WHERE ...`). Servono per due
-- famiglie di problemi:
--
--   1. Operazioni contabili non idempotenti: doppio click, doppio invio,
--      retry di rete producono scadenze, fatture e riconciliazioni duplicate.
--      I fix applicativi (transazioni, lock) arrivano a parte; il lucchetto
--      definitivo è il vincolo nel database.
--   2. Unicità che oggi conta anche i record soft-deleted: cancellata per
--      errore la chiusura del 5 agosto, quel giorno resta occupato per sempre
--      perché l'indice unique "pieno" vede ancora la riga cancellata.
--
-- Come si applica
-- ---------------
--   psql "$DATABASE_URL" -f prisma/migrations/post-push/constraints.sql
--
-- SEMPRE DOPO `prisma db push`, MAI PRIMA. Leggere il README di questa
-- cartella: l'ordine obbligato è assessment dei duplicati -> bonifica ->
-- applicazione dei vincoli. Su dati già sporchi la CREATE INDEX fallisce.
--
-- Lo script è idempotente: eseguirlo due volte non cambia nulla e non erra.
-- =============================================================================

-- Ferma tutto al primo vincolo violato, anche se psql è stato invocato senza
-- -v ON_ERROR_STOP=1. Senza questa riga gli errori scorrerebbero via nel log e
-- si finirebbe con metà vincoli applicati credendo sia andato tutto bene.
\set ON_ERROR_STOP on


-- -----------------------------------------------------------------------------
-- 1. schedule_reconciliations — la stessa coppia (scadenza, movimento) non può
--    essere riconciliata due volte.
--
--    Bug che impedisce: due click su "abbina" creano due ScheduleReconciliation
--    identiche, ognuna genera il proprio SchedulePayment, e la scadenza risulta
--    pagata il doppio del dovuto. Il filtro su VERIFIED è necessario: una
--    riconciliazione REJECTED è storia, e la stessa coppia deve poter essere
--    riabbinata dopo un rifiuto.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_schedule_reconciliations_coppia_verificata
  ON schedule_reconciliations (schedule_id, journal_entry_id)
  WHERE status = 'VERIFIED';


-- -----------------------------------------------------------------------------
-- 2. electronic_invoices — la stessa fattura non si importa due volte.
--
--    Bug che impedisce: il doppio upload dello stesso XML (o il retry dopo un
--    timeout) crea due fatture identiche, quindi due registrazioni di prima
--    nota e due serie di scadenze. Il costo compare due volte a bilancio.
--
--    La terna (numero, data, P.IVA cedente) è la stessa che usa già il dedup
--    applicativo in src/app/api/invoices/route.ts e /invoices/parse/route.ts:
--    il vincolo non stringe più del codice, gli fa solo da rete. NON include
--    venue_id proprio perché il dedup applicativo è globale.
--
--    Limite noto: il codice tollera le varianti di P.IVA con e senza zeri
--    iniziali (dati pre-normalizzazione), il vincolo no. Due righe che
--    differiscono solo per gli zeri iniziali restano possibili a livello DB.
--    Sistemabile solo normalizzando i dati storici.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_electronic_invoices_numero_data_piva
  ON electronic_invoices (invoice_number, invoice_date, supplier_vat)
  WHERE deleted_at IS NULL;


-- -----------------------------------------------------------------------------
-- 3. schedules — la stessa occorrenza ricorrente non si genera due volte.
--
--    Bug che impedisce: doppio click su "genera" (o due cron sovrapposti)
--    creano due scadenze identiche per la stessa data, e l'affitto di agosto
--    compare due volte nel previsionale di cassa.
--
--    Servono DUE indici perché il progetto ha due percorsi di generazione,
--    entrambi vivi e con campi diversi:
--      - recurrence_id       -> ricorrenze come template (modello Recurrence),
--                               src/app/api/scadenzario/ricorrenze/[id]/genera
--      - ricorrenza_parent_id -> ricorrenze come catena padre/figlio,
--                               src/app/api/scadenzario/[id]/genera-prossima
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_schedules_ricorrenza_occorrenza
  ON schedules (recurrence_id, data_scadenza)
  WHERE recurrence_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_schedules_ricorrenza_parent_occorrenza
  ON schedules (ricorrenza_parent_id, data_scadenza)
  WHERE ricorrenza_parent_id IS NOT NULL AND deleted_at IS NULL;


-- -----------------------------------------------------------------------------
-- 4. suppliers — una partita IVA, un fornitore.
--
--    Bug che impedisce: l'import SDI e la creazione manuale possono creare due
--    anagrafiche per lo stesso fornitore. Lo storico si spezza fra le due, e la
--    stima del ritardo di pagamento (che legge i pagamenti passati per
--    fornitore) diventa sbagliata su entrambe.
--
--    Il modello Supplier non ha soft delete (nessuna colonna deleted_at):
--    il predicato filtra solo i valori assenti. La stringa vuota è esclusa
--    perché lo zod dei fornitori accetta `''` come "non compilato" e più
--    fornitori senza P.IVA sono legittimi.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_partita_iva
  ON suppliers (vat_number)
  WHERE vat_number IS NOT NULL AND vat_number <> '';


-- =============================================================================
-- 5. Conversione degli unique "pieni" in indici parziali
-- =============================================================================
--
-- Questi tre vincoli esistevano già come `@@unique` in schema.prisma, ma
-- contavano anche i record soft-deleted. Il `@@unique` è stato RIMOSSO dallo
-- schema (vedi i commenti nei modelli DailyClosure, Budget, BankTransaction) e
-- sostituito qui dalla versione parziale.
--
-- I DROP servono per il primo passaggio su un database che ha ancora i vincoli
-- vecchi. Prisma li crea come indici, ma li droppiamo anche come constraint nel
-- caso siano stati creati diversamente in passato: `DROP CONSTRAINT IF EXISTS`
-- porta via anche l'indice sottostante, quindi va per primo.
-- -----------------------------------------------------------------------------

-- 5a. daily_closures — una sola chiusura per sede e giorno, fra quelle vive.
--
--     Bug che impedisce: due chiusure di cassa per lo stesso giorno raddoppiano
--     l'incasso in prima nota.
--     Bug che sblocca: con l'unique pieno, una chiusura cancellata per errore
--     rendeva quel giorno irripetibile — nessuno poteva più chiudere il 5 agosto.
ALTER TABLE daily_closures DROP CONSTRAINT IF EXISTS daily_closures_venue_id_date_key;
DROP INDEX IF EXISTS daily_closures_venue_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_closures_sede_giorno
  ON daily_closures (venue_id, date)
  WHERE deleted_at IS NULL;


-- 5b. budgets — un solo budget per sede e anno, fra quelli vivi.
--
--     Bug che impedisce: due budget per lo stesso anno, con gli scostamenti
--     calcolati su quello sbagliato.
--     Bug che sblocca: un budget cancellato bloccava per sempre la ricreazione
--     di quell'anno.
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_venue_id_year_key;
DROP INDEX IF EXISTS budgets_venue_id_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_budgets_sede_anno
  ON budgets (venue_id, year)
  WHERE deleted_at IS NULL;


-- 5c. bank_transactions — un movimento bancario per riferimento banca, fra
--     quelli vivi.
--
--     Bug che impedisce: reimportare lo stesso estratto conto duplica i
--     movimenti, e ogni duplicato è riconciliabile a sua volta.
--     Bug che sblocca: un movimento cancellato impediva di reimportarlo dopo
--     una correzione del file sorgente.
--
--     Il filtro su bank_reference NOT NULL riproduce il comportamento
--     precedente (in Postgres i NULL non collidono mai fra loro in un unique)
--     e tiene l'indice più piccolo: i movimenti senza riferimento banca,
--     che sono legittimamente molti, restano fuori dall'indice.
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_venue_id_bank_reference_key;
DROP INDEX IF EXISTS bank_transactions_venue_id_bank_reference_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_transactions_sede_riferimento
  ON bank_transactions (venue_id, bank_reference)
  WHERE deleted_at IS NULL AND bank_reference IS NOT NULL;


-- =============================================================================
-- 6. Indici di performance
-- =============================================================================
--
-- Vivono in schema.prisma come `@@index` (Prisma li esprime benissimo, e lo
-- schema è la fonte di verità dove può esserlo). Elencati qui solo perché li
-- si trovi cercando in questo file:
--
--   payments (venue_id, stato)              -- filtro della lista pagamenti
--   payments (data_esecuzione)              -- ordinamento e finestre temporali
--   schedules (venue_id, data_attesa)       -- proiezione di cassa
--   categorization_rules (venue_id)         -- caricate a ogni categorizzazione
--   cash_flow_forecasts (venue_id)          -- lista previsionali della sede
--   daily_closures (venue_id, date)         -- rimpiazza l'unique rimosso al 5a
--   budgets (venue_id, year)                -- rimpiazza l'unique rimosso al 5b
--   bank_transactions (venue_id, bank_reference) -- rimpiazza l'unique al 5c
--
-- Gli ultimi tre non sono facoltativi: senza, rimuovendo i `@@unique` si
-- perderebbe anche l'unico indice che serviva quelle colonne, perché la
-- versione parziale copre solo le query che filtrano i cancellati.
-- =============================================================================
