-- =============================================================================
-- Provenienza del centro di costo sul movimento
--
-- Additivo rispetto a 2026-08-07_piano_v4_centri_costo.sql, che resta invariato
-- e va applicato prima: qui si aggiunge solo la colonna che dice DA DOVE viene
-- il centro di costo di un movimento.
--
-- Perché serve: il sistema, sui percorsi automatici (import dell'estratto
-- conto, motore delle regole, ereditarietà delle fette), imputa il centro
-- operativo predefinito quando nessuno l'ha scelto. Guardando il solo
-- cost_center_id, un WEISS indovinato dal sistema è indistinguibile da un
-- WEISS scelto da un umano: il batch di ricategorizzazione promuoverebbe a
-- "verificato" un'imputazione che nessuno ha guardato. L'informazione non è
-- ricostruibile a posteriori, quindi va persistita — stesso schema di
-- schedules.data_attesa_source.
--
-- Valori: 'scelto' | 'piano' | 'supposto'. NULL sui movimenti anteriori alla
-- colonna: provenienza ignota, che il codice tratta come 'supposto' quando
-- deve decidere se un movimento può diventare verificato da solo.
--
-- Colonna NULLABLE di proposito: il DDL si applica prima del deploy del codice
-- che la valorizza, e nell'interstizio il codice vecchio continua a scrivere
-- movimenti senza toccarla.
--
-- Idempotente: eseguibile più volte senza errori.
-- =============================================================================

ALTER TABLE "journal_entries"
  ADD COLUMN IF NOT EXISTS "cost_center_source" TEXT;
