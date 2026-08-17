-- Lo scalino che mancava fra «Da pagare» e «Pagata».
--
-- Una fattura con una rata su due saldata — o con l'unica rata saldata a metà —
-- risultava intatta come una appena importata.
--
-- L'enum si ricrea invece di usare `ALTER TYPE ... ADD VALUE`: è il pattern già
-- applicato il 15 agosto per togliere RECORDED, e non ha la limitazione
-- dell'aggiunta di valore, che in transazione non è utilizzabile finché non si
-- committa. Qui non serve usarlo subito, ma tenere un solo modo di modificare
-- questo enum vale più della riga risparmiata.

ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";

CREATE TYPE "InvoiceStatus" AS ENUM ('IMPORTED', 'MATCHED', 'CATEGORIZED', 'PARTIALLY_PAID', 'PAID');

ALTER TABLE "electronic_invoices"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "electronic_invoices"
  ALTER COLUMN "status" TYPE "InvoiceStatus" USING ("status"::text::"InvoiceStatus");

ALTER TABLE "electronic_invoices"
  ALTER COLUMN "status" SET DEFAULT 'IMPORTED';

DROP TYPE "InvoiceStatus_old";

-- Nessun UPDATE dei dati, e non è una scorciatoia: misurato il 15 agosto 2026,
-- in produzione c'è UNA fattura viva, con una sola scadenza e `importo_pagato`
-- a zero. Non esiste alcuna riga da riclassificare.
--
-- Anche in futuro il valore nuovo lo scriverà `allineaFattura` al primo
-- ricalcolo della scadenza: riclassificare qui in SQL significherebbe
-- riscrivere in un secondo posto la regola che vive in TypeScript, ed è il modo
-- più diretto perché le due versioni divergano.
