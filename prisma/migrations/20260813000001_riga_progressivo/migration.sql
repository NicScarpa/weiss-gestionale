-- invoice_line_accounts: una riga di fattura può essere divisa fra più conti.
--
-- Il vincolo precedente, unique(invoice_id, numero_linea), vietava per
-- costruzione il caso del fornitore che accorpa voci diverse in una riga sola:
-- 100 € di "detersivi" che sono 60 di detersivi e 40 di tovaglioli. Il
-- progressivo apre quel caso senza aprire i duplicati.
--
-- Default 0: le righe esistenti sono tutte quote uniche della loro linea, e
-- restano valide sotto il vincolo nuovo senza backfill.
ALTER TABLE "invoice_line_accounts" ADD COLUMN "progressivo" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "invoice_line_accounts_invoice_id_numero_linea_key";
CREATE UNIQUE INDEX "invoice_line_accounts_invoice_id_numero_linea_progressivo_key"
  ON "invoice_line_accounts" ("invoice_id", "numero_linea", "progressivo");
