# Debito: `react-hooks/set-state-in-effect` — 40 occorrenze in 34 file

**Rilevato:** 7 agosto 2026, durante la W3. **Stato:** non corretto, pianificato.

## Perché è debito con una data di scadenza

Chiamare `setState` **sincronamente dentro un effetto** innesca un secondo render immediato: il
componente si disegna, l'effetto parte, lo stato cambia, il componente si ridisegna. Su una tabella
o una pagina con più effetti concatenati diventa una cascata di render che l'utente percepisce come
lentezza o sfarfallio.

Oggi il progetto non se ne accorge perché `eslint-plugin-react-hooks` è alla **7.0.1**, dove la
regola è un semplice avviso. Nella **7.1.1 la stessa regola è un errore**: al primo aggiornamento
legittimo del plugin — che arriverà con un `npm update` o con Next — **la CI si ferma su 40 errori**.

Sono emerse per caso, da un worktree con l'ambiente andato alla deriva (vedi `STATO-REMEDIATION.md`
§6 n.10), ma **non sono un artefatto**: il codice è quello, e il difetto è reale a prescindere dalla
versione del plugin che lo segnala.

## Come affrontarle (proposta)

Non è lavoro da infilare in un'ondata in corso: tocca 34 file di dominio diverso, molti dei quali
appartengono ad altri lotti. Va fatto come lotto a sé, con un agente dedicato, in W4:

1. Raggruppare per schema ricorrente. La maggioranza sarà "carico i dati e li metto nello stato"
   (va sostituita con il caricamento dichiarativo di TanStack Query, già usato altrove nel progetto)
   oppure "sincronizzo uno stato derivato da una prop" (va calcolato durante il render, non in un
   effetto).
2. Un commit per gruppo, non uno per file, così la revisione è leggibile.
3. Alla fine, **alzare `eslint-plugin-react-hooks` alla 7.1.x nello stesso lotto**: è la prova che
   il debito è estinto, e impedisce che rientri.

## Elenco completo (`file:righe`)

```
src/app/(auth)/invito/page.tsx:45
src/app/(auth)/login/page.tsx:52
src/app/(auth)/reset-password/page.tsx:30
src/app/(dashboard)/anagrafiche/clienti/page.tsx:62,86
src/app/(dashboard)/anagrafiche/utenti/page.tsx:55,86
src/app/(dashboard)/budget/BudgetList.tsx:123
src/app/(dashboard)/budget/[id]/BudgetDetailClient.tsx:120
src/app/(dashboard)/budget/confronto/BudgetConfrontoClient.tsx:192
src/app/(dashboard)/cash-flow/page.tsx:78
src/app/(dashboard)/chiusura-cassa/ClosureList.tsx:155
src/app/(dashboard)/fatture/page.tsx:69
src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx:137
src/app/(dashboard)/prima-nota/pagamenti/PagamentiClient.tsx:63
src/app/(dashboard)/report/incassi-giornalieri/DailyRevenueClient.tsx:229
src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx:84
src/app/(dashboard)/turni/[id]/page.tsx:117
src/components/chiusura/ClosureForm.tsx:122
src/components/portal/NotificationSettings.tsx:52
src/components/portal/PunchButton.tsx:291
src/components/prima-nota/movimenti/SplitEntryDialog.tsx:80
src/components/prima-nota/regole/CategorizationProposalsDialog.tsx:76
src/components/prima-nota/regole/CategorizationRulesManager.tsx:85
src/components/reconciliation/MatchDialog.tsx:72
src/components/reconciliation/TransactionDetailsDialog.tsx:103
src/components/scadenzario/create-schedule-sheet.tsx:231
src/components/scadenzario/payment-dialog.tsx:70
src/components/settings/AccountMappingManager.tsx:186,192
src/components/settings/BancheEContiClient.tsx:104
src/components/settings/BudgetCategoryManagement.tsx:115,121,122
src/components/settings/SupplierManagement.tsx:112
src/components/settings/VenueManagement.tsx:69
src/components/ui/address-autocomplete.tsx:60
src/components/ui/payee-autocomplete.tsx:58,64
src/hooks/useOffline.ts:49
```

## Nello stesso passaggio alla 7.1.1 comparivano anche

- 8 `exhaustive-deps` (dipendenze di effetti dichiarate male)
- 6 `immutability`
- 5 `incompatible-library`, tutti sul `watch()` di react-hook-form: probabilmente **inevitabili**,
  perché quell'API restituisce funzioni che il React Compiler non può memoizzare. Vanno esclusi con
  una deroga motivata, non "corretti".

L'elenco dettagliato di questi tre gruppi è recuperabile ripetendo la misura con il plugin 7.1.1 in
un ambiente usa-e-getta (**mai** con `npm install --no-package-lock`: vedi la trappola §6 n.10).
