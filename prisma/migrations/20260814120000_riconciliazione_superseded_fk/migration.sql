-- La colonna `superseded_by_proposal_id` di `reconciliation_proposals` nasceva
-- (migrazione 20260814090000) come TEXT libero: nessuna foreign key, nessun
-- indice, nessuno scrittore. Il vincolo si aggiunge adesso, finché la tabella è
-- vuota — è l'unico momento in cui costa zero. Dopo, con qualche migliaio di
-- righe, aggiungerlo significa prima trovare e ripulire i riferimenti morti che
-- nel frattempo si sono accumulati.
--
-- ON DELETE SET NULL e non CASCADE: se sparisce la proposta *che ha superato*
-- questa, questa non va cancellata — la sua storia è comunque accaduta, perde
-- solo il rimando.

CREATE INDEX "reconciliation_proposals_superseded_by_proposal_id_idx" ON "reconciliation_proposals"("superseded_by_proposal_id");

ALTER TABLE "reconciliation_proposals" ADD CONSTRAINT "reconciliation_proposals_superseded_by_proposal_id_fkey" FOREIGN KEY ("superseded_by_proposal_id") REFERENCES "reconciliation_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
