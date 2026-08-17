-- Estratto conto nella prima nota, consegna B: le azioni contabili.
-- Spec: docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md
--
-- `origine_scrittura` dice se la scrittura collegata l'ha creata la promozione
-- e da quale azione (è ciò che lo scollegamento ritira); `residuo_documenti` è
-- il residuo dei documenti denormalizzato sulla riga, così «Solo non
-- riconciliati» prende anche i parziali in SQL.

CREATE TYPE "OrigineScritturaBancaria" AS ENUM ('CATEGORIZZA', 'COLLEGA', 'PROPOSTA');

ALTER TABLE "bank_transactions"
  ADD COLUMN "origine_scrittura" "OrigineScritturaBancaria",
  ADD COLUMN "residuo_documenti" DECIMAL(12,2);

-- Le righe già collegate a una scrittura ricevono il residuo calcolato dalle
-- riconciliazioni di quella scrittura: 0 se non ne ha (collegata senza
-- documenti), altrimenti |importo| − somma, mai sotto zero. In produzione al
-- 17 agosto nessuna riga è collegata: la UPDATE non tocca nulla, ma la
-- migrazione deve valere anche su un database che ha già usato la
-- riconciliazione.
UPDATE "bank_transactions" bt
SET "residuo_documenti" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "schedule_reconciliations" sr
    WHERE sr."journal_entry_id" = bt."matched_entry_id" AND sr."status" = 'VERIFIED'
  )
  THEN GREATEST(
    0,
    ABS(bt."amount") - (
      SELECT COALESCE(SUM(sr."amount"), 0) FROM "schedule_reconciliations" sr
      WHERE sr."journal_entry_id" = bt."matched_entry_id" AND sr."status" = 'VERIFIED'
    )
  )
  ELSE 0
END
WHERE bt."matched_entry_id" IS NOT NULL;
