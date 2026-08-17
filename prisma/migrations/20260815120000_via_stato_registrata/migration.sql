-- Un documento fiscale non genera denaro.
-- Spec: docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md
--
-- La prima nota mostrava un'uscita di banca di 92,60 € verso TIM che in banca
-- non esisteva: l'aveva scritta il gestionale, premendo «Registra in Prima
-- Nota» sulla fattura. Tolto quel bottone, lo stato RECORDED e le due colonne
-- che lo sostenevano non descrivono più nulla.
--
-- L'ordine è obbligato: PostgreSQL non sa eliminare un valore da un enum, e
-- non accetta di ricrearlo finché qualche riga lo usa ancora.

-- 1. Le fatture che dicevano «registrata» scendono al gradino che i dati sanno
--    dimostrare. È la stessa regola di `statoFatturaNonPagata`
--    (src/lib/scadenzario/stato-schedule.ts), e va applicata in quest'ordine
--    perché ogni UPDATE restringe l'insieme per il successivo.
UPDATE "electronic_invoices"
SET "status" = 'CATEGORIZED'
WHERE "status" = 'RECORDED' AND "account_id" IS NOT NULL;

UPDATE "electronic_invoices"
SET "status" = 'MATCHED'
WHERE "status" = 'RECORDED' AND "supplier_id" IS NOT NULL;

UPDATE "electronic_invoices"
SET "status" = 'IMPORTED'
WHERE "status" = 'RECORDED';

-- 2. L'enum si ricrea senza RECORDED.
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";

CREATE TYPE "InvoiceStatus" AS ENUM ('IMPORTED', 'MATCHED', 'CATEGORIZED', 'PAID');

ALTER TABLE "electronic_invoices"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "electronic_invoices"
  ALTER COLUMN "status" TYPE "InvoiceStatus" USING ("status"::text::"InvoiceStatus");

ALTER TABLE "electronic_invoices"
  ALTER COLUMN "status" SET DEFAULT 'IMPORTED';

DROP TYPE "InvoiceStatus_old";

-- 3. Le due colonne che servivano solo al bottone eliminato. Toglierle è ciò
--    che rende la regola strutturale invece che convenuta: senza di esse non
--    esiste più il modo di dire «questa fattura ha generato questo movimento».
--    Il legame sano fra fattura e movimento resta, e passa da
--    `schedule_reconciliations`.
ALTER TABLE "electronic_invoices"
  DROP COLUMN "journal_entry_id",
  DROP COLUMN "recorded_at";
