-- invoice_line_accounts: una riga di fattura può essere divisa fra più conti.
--
-- Il vincolo precedente, unique(invoice_id, numero_linea), vietava per
-- costruzione il caso del fornitore che accorpa voci diverse in una riga sola:
-- 100 € di "detersivi" che sono 60 di detersivi e 40 di tovaglioli. Il
-- progressivo apre quel caso senza aprire i duplicati.
--
-- Default 0: le righe esistenti sono tutte quote uniche della loro linea, e
-- restano valide sotto il vincolo nuovo senza backfill.
--
-- DROP senza IF EXISTS, deliberatamente: il nome dell'indice è stato
-- verificato solo sul database locale, non in produzione. Con IF EXISTS un
-- nome diverso in produzione farebbe passare la migrazione lasciando in
-- piedi il vincolo a due colonne — la prima divisione fallirebbe più tardi
-- con un P2002 silenzioso e senza indizi. Senza IF EXISTS, un nome diverso fa
-- fallire il deploy qui: `prisma migrate deploy` esce con codice diverso da
-- zero e rifiuta ogni migrazione successiva finché qualcuno non risolve a
-- mano (`prisma migrate resolve`) — verificato rinominando l'indice su un
-- database di prova e riprovando il deploy.
--
-- Non è però atomica: contro un nome sbagliato, ADD COLUMN va a segno PRIMA
-- che il DROP INDEX fallisca, e resta scritta anche se `_prisma_migrations`
-- segna la migrazione come non applicata (`applied_steps_count: 0` non
-- descrive lo stato vero). Chi recupera a mano da un fallimento deve saperlo:
-- il DROP COLUMN "progressivo" potrebbe già servire prima di ritentare.
ALTER TABLE "invoice_line_accounts" ADD COLUMN "progressivo" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "invoice_line_accounts_invoice_id_numero_linea_key";
CREATE UNIQUE INDEX "invoice_line_accounts_invoice_id_numero_linea_progressivo_key"
  ON "invoice_line_accounts" ("invoice_id", "numero_linea", "progressivo");
