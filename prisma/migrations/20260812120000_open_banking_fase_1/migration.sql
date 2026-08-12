-- Fase 1 dell'integrazione open banking GoCardless.
-- Spec: docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md
-- Referto della sonda: docs/gocardless-referto-2026-08-12.md

-- Va per primo e da solo: PostgreSQL vieta di USARE un valore d'enum nella
-- stessa transazione in cui lo si aggiunge. Qui non lo usiamo, ma tenerlo in
-- testa rende la regola visibile a chi modificherà questo file.
ALTER TYPE "ImportSource" ADD VALUE IF NOT EXISTS 'PSD2_GOCARDLESS';

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gocardless',
    "institution_id" TEXT NOT NULL,
    "institution_name" TEXT NOT NULL,
    "requisition_id" TEXT NOT NULL,
    "agreement_id" TEXT,
    "status" TEXT NOT NULL,
    "access_valid_until" TIMESTAMP(3),
    "max_historical_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_connections_requisition_id_key" ON "bank_connections"("requisition_id");
CREATE INDEX "bank_connections_venue_id_idx" ON "bank_connections"("venue_id");

ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "bank_sync_runs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "esito" TEXT NOT NULL,
    "http_status" INTEGER,
    "movimenti_letti" INTEGER NOT NULL DEFAULT 0,
    "movimenti_nuovi" INTEGER NOT NULL DEFAULT 0,
    "movimenti_duplicati" INTEGER NOT NULL DEFAULT 0,
    "rate_limit_remaining" INTEGER,
    "rate_limit_reset_at" TIMESTAMP(3),
    "errore" TEXT,
    CONSTRAINT "bank_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_sync_runs_venue_id_started_at_idx" ON "bank_sync_runs"("venue_id", "started_at");
CREATE INDEX "bank_sync_runs_bank_account_id_started_at_idx" ON "bank_sync_runs"("bank_account_id", "started_at");

ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "bank_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: i conti
ALTER TABLE "bank_accounts"
    ADD COLUMN "connection_id" TEXT,
    ADD COLUMN "provider_account_id" TEXT,
    ADD COLUMN "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "sync_cutoff_date" DATE,
    ADD COLUMN "last_sync_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "bank_accounts_provider_account_id_key" ON "bank_accounts"("provider_account_id");

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "bank_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: i movimenti
ALTER TABLE "bank_transactions"
    ADD COLUMN "bank_account_id" TEXT,
    ADD COLUMN "provider_transaction_id" VARCHAR(100),
    ADD COLUMN "bank_transaction_code" VARCHAR(20);

CREATE INDEX "bank_transactions_bank_account_id_transaction_date_idx"
    ON "bank_transactions"("bank_account_id", "transaction_date");

ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La chiave di deduplicazione dei movimenti che arrivano dalla banca.
--
-- Perché il conto è dentro: l'identificativo di GoCardless è un contatore per
-- giorno E per conto (`20260810-6`), quindi lo stesso valore compare su conti
-- diversi riferito a movimenti diversi — misurato: 244 valori su 653 movimenti
-- di due soli conti. L'indice storico `ux_bank_transactions_sede_riferimento`
-- è su `(venue_id, bank_reference)` e non contiene il conto: da solo farebbe
-- scartare come duplicati dei movimenti veri.
--
-- Parziale perché i movimenti importati da CSV non hanno né conto né
-- identificativo del provider, e non devono collidere fra loro su NULL.
CREATE UNIQUE INDEX "ux_bank_transactions_conto_provider"
    ON "bank_transactions"("bank_account_id", "provider_transaction_id")
    WHERE "deleted_at" IS NULL
      AND "bank_account_id" IS NOT NULL
      AND "provider_transaction_id" IS NOT NULL;

-- Backfill prudente dei movimenti storici.
--
-- Assegna il conto SOLO alle sedi che ne hanno esattamente uno attivo: lì
-- l'attribuzione è certa. Dove i conti sono più d'uno, `bank_account_id`
-- resta NULL, perché indovinare a quale conto appartenga un movimento
-- importato da CSV due mesi fa produrrebbe dati falsi che nessuno saprebbe
-- più distinguere da quelli veri.
UPDATE "bank_transactions" bt
SET "bank_account_id" = unico."id"
FROM (
    SELECT "venue_id", MIN("id") AS "id", COUNT(*) AS n
    FROM "bank_accounts"
    WHERE "is_active" = true
    GROUP BY "venue_id"
) unico
WHERE bt."venue_id" = unico."venue_id"
  AND unico.n = 1
  AND bt."bank_account_id" IS NULL;
