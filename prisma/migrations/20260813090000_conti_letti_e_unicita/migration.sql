-- Fase 2b dell'integrazione open banking.
-- Spec: docs/superpowers/specs/2026-08-12-open-banking-fase-2-design.md

-- I conti letti dalla banca, conservati per non richiederli a ogni apertura
-- del pannello: il contingente e' di 4 chiamate al giorno per conto.
-- Nessun IBAN in chiaro qui dentro: impronta e forma mascherata.
ALTER TABLE "bank_connections"
    ADD COLUMN "conti_letti" JSONB,
    ADD COLUMN "conti_letti_il" TIMESTAMP(3);

-- Un solo collegamento vivo per sede.
--
-- Il controllo applicativo in POST /collegamenti (findFirst poi create) e' una
-- lettura seguita da una scrittura: due richieste concorrenti — un doppio clic
-- sul pulsante di conferma — lo superano entrambe e creano due connessioni,
-- due agreement e due requisition, cioe' sei chiamate alla banca invece di
-- tre. Il pannello ne mostrerebbe una sola e l'altra resterebbe invisibile.
--
-- Parziale su `deleted_at IS NULL` perche' le connessioni scollegate restano
-- in tabella e devono poter convivere con quella viva.
CREATE UNIQUE INDEX "ux_bank_connections_sede_viva"
    ON "bank_connections"("venue_id")
    WHERE "deleted_at" IS NULL;
