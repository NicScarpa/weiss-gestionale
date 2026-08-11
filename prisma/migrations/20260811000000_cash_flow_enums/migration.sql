-- Riclassificazione cash flow (spec 2026-08-11).
--
-- PATRIMONIALE: il mastro 40 non è né ricavo né costo. ATTIVO e PASSIVO
-- restano ai conti di sistema (cassa, banca, debiti v/fornitori).
--
-- FINANCING: la famiglia I del prospetto (rimborsi capitale, nuova finanza,
-- soci) non è un investimento e non è un'imposta.
--
-- I valori nuovi di un enum non sono utilizzabili nella stessa transazione
-- che li aggiunge: questa migrazione aggiunge soltanto: chi li usa arriva
-- dopo, con i dati.
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'PATRIMONIALE';
ALTER TYPE "BudgetCategoryType" ADD VALUE IF NOT EXISTS 'FINANCING';
