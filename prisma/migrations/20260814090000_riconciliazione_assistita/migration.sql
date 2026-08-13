-- Riconciliazione assistita, Fase A1: i lotti di proposte e la memoria delle
-- controparti.
-- Spec: docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md

CREATE TABLE "reconciliation_batches" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "regole_usate" TEXT[] NOT NULL,
    "soglia_minima" INTEGER NOT NULL DEFAULT 40,
    "stato" TEXT NOT NULL DEFAULT 'in_corso',
    "conta_proposte" INTEGER NOT NULL DEFAULT 0,
    "conta_approvate" INTEGER NOT NULL DEFAULT 0,
    "conta_scartate" INTEGER NOT NULL DEFAULT 0,
    "conta_superate" INTEGER NOT NULL DEFAULT 0,
    "ai_referto_at" TIMESTAMP(3),
    "ai_referto" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reconciliation_proposals" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "regola" TEXT NOT NULL,
    "punteggio" INTEGER NOT NULL,
    "fattori" JSONB NOT NULL,
    "motivazioni" JSONB NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'in_attesa',
    "superseded_by_proposal_id" TEXT,
    "bank_transaction_id" TEXT,
    "journal_entry_id" TEXT,
    "deciso_da" TEXT,
    "deciso_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reconciliation_proposal_legs" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "peer_bank_transaction_id" TEXT,
    "importo" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "reconciliation_proposal_legs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "counterparty_aliases" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "testo_normalizzato" TEXT NOT NULL,
    "supplier_id" TEXT,
    "customer_id" TEXT,
    "origine" TEXT NOT NULL,
    "conferme_conta" INTEGER NOT NULL DEFAULT 1,
    "ultima_conferma" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "counterparty_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reconciliation_exclusions" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "bank_transaction_id" TEXT,
    "schedule_id" TEXT,
    "motivo" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reconciliation_batches_venue_id_created_at_idx" ON "reconciliation_batches"("venue_id", "created_at");
CREATE INDEX "reconciliation_proposals_batch_id_stato_idx" ON "reconciliation_proposals"("batch_id", "stato");
CREATE INDEX "reconciliation_proposals_bank_transaction_id_idx" ON "reconciliation_proposals"("bank_transaction_id");
CREATE INDEX "reconciliation_proposal_legs_proposal_id_idx" ON "reconciliation_proposal_legs"("proposal_id");
CREATE INDEX "reconciliation_proposal_legs_schedule_id_idx" ON "reconciliation_proposal_legs"("schedule_id");
CREATE UNIQUE INDEX "counterparty_aliases_venue_id_testo_normalizzato_key" ON "counterparty_aliases"("venue_id", "testo_normalizzato");
CREATE INDEX "counterparty_aliases_venue_id_supplier_id_idx" ON "counterparty_aliases"("venue_id", "supplier_id");
CREATE INDEX "reconciliation_exclusions_venue_id_bank_transaction_id_idx" ON "reconciliation_exclusions"("venue_id", "bank_transaction_id");

ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "reconciliation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_deciso_da_fkey" FOREIGN KEY ("deciso_da") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposal_legs" ADD CONSTRAINT "reconciliation_proposal_legs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "reconciliation_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposal_legs" ADD CONSTRAINT "reconciliation_proposal_legs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_proposal_legs" ADD CONSTRAINT "reconciliation_proposal_legs_peer_bank_transaction_id_fkey" FOREIGN KEY ("peer_bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "counterparty_aliases" ADD CONSTRAINT "counterparty_aliases_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "counterparty_aliases" ADD CONSTRAINT "counterparty_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "counterparty_aliases" ADD CONSTRAINT "counterparty_aliases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_exclusions" ADD CONSTRAINT "reconciliation_exclusions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_exclusions" ADD CONSTRAINT "reconciliation_exclusions_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliation_exclusions" ADD CONSTRAINT "reconciliation_exclusions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
