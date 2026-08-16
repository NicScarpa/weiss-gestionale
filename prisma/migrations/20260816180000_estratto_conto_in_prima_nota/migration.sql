-- Estratto conto nella prima nota, consegna A.
-- Spec: docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md
--
-- `description` resta il testo grezzo della banca. `causale` e `descrizione`
-- sono ciò che si legge e si modifica; `note` è dell'utente; `sezione` è la
-- scheda (Attivi / Deleghe F24 / CBILL-PagoPA). La cronologia registra
-- prima/dopo/chi per ogni campo cambiato.

CREATE TYPE "SezioneMovimentoBancario" AS ENUM ('ATTIVI', 'DELEGHE_F24', 'CBILL_PAGOPA');

ALTER TABLE "bank_transactions"
  ADD COLUMN "causale" VARCHAR(120),
  ADD COLUMN "descrizione" VARCHAR(500),
  ADD COLUMN "note" TEXT,
  ADD COLUMN "sezione" "SezioneMovimentoBancario" NOT NULL DEFAULT 'ATTIVI';

CREATE TABLE "bank_transaction_edits" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "campo" VARCHAR(20) NOT NULL,
    "prima" TEXT,
    "dopo" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_transaction_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_transaction_edits_bank_transaction_id_created_at_idx"
  ON "bank_transaction_edits"("bank_transaction_id", "created_at");

ALTER TABLE "bank_transaction_edits"
  ADD CONSTRAINT "bank_transaction_edits_bank_transaction_id_fkey"
  FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
