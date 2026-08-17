-- electronic_invoices.rettifica_invoice_id: nota di credito → fattura che
-- rettifica (Task 6, fase B). Autorelazione risolta una sola volta,
-- all'import della nota di credito, leggendo `references.datiFattureCollegate`
-- (src/app/api/invoices/route.ts): persistita qui invece di essere
-- ricalcolata interrogando il JSON a ogni lettura, perché il calcolo dei pesi
-- alla riconciliazione la interroga una volta per fattura, non una volta per
-- riga.
--
-- Nullable e senza backfill: le fatture già importate restano `null`
-- (nessuna rettifica nota), che è esattamente il loro stato vero — l'unica
-- fonte che può popolare il campo è il flusso di import, che gira solo in
-- avanti.
--
-- ON DELETE SET NULL, come le altre autorelazioni dello schema
-- (accounts.parent_id, budget_categories.parent_id): la fattura rettificata
-- non si cancella mai davvero (soft-delete, `deletedAt`), ma se un giorno lo
-- facesse non deve trascinare con sé il vincolo che impedirebbe la
-- cancellazione.
--
-- Non atomica: tre statement, nessuno protetto da IF EXISTS di proposito
-- (vedi 20260813000001_riga_progressivo per il perché). Se ADD COLUMN va a
-- segno e uno dei due successivi fallisce, `_prisma_migrations` segna
-- `applied_steps_count: 0` ma la colonna resta scritta a database. Recupero:
-- `prisma migrate resolve --rolled-back 20260813000002_nota_credito_rettifica`,
-- poi `ALTER TABLE "electronic_invoices" DROP COLUMN "rettifica_invoice_id";`
-- (e l'eventuale vincolo o indice già creato) a mano, prima di ritentare il
-- deploy.
ALTER TABLE "electronic_invoices" ADD COLUMN "rettifica_invoice_id" TEXT;
ALTER TABLE "electronic_invoices" ADD CONSTRAINT "electronic_invoices_rettifica_invoice_id_fkey" FOREIGN KEY ("rettifica_invoice_id") REFERENCES "electronic_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "electronic_invoices_rettifica_invoice_id_idx" ON "electronic_invoices"("rettifica_invoice_id");
