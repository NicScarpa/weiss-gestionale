# Debito: regole React Compiler — 40 errori in 34 file

**Rilevato:** 7 agosto 2026, durante la W3. **Stato:** non corretto, pianificato.

> **Rettifica del 7 ago (fonte: C2-ORFANI).** La prima stesura di questo documento attribuiva tutte
> e 40 le occorrenze a `set-state-in-effect`. È sbagliato: quella regola ne fa **30**. Le altre 10
> sono difetti diversi, con rimedi diversi, ed è per questo che l'elenco qui sotto è ora diviso per
> regola. Chi pianifica il lotto tratti i quattro gruppi separatamente.

## Perché è debito con una data di scadenza

Chiamare `setState` **sincronamente dentro un effetto** innesca un secondo render immediato: il
componente si disegna, l'effetto parte, lo stato cambia, il componente si ridisegna. Su una tabella
o una pagina con più effetti concatenati diventa una cascata di render che l'utente percepisce come
lentezza o sfarfallio.

Oggi il progetto non se ne accorge perché con `eslint-plugin-react-hooks` **7.0.1 la regola non si
attiva affatto**: `npx eslint src` sul ramo di integrazione riporta **zero** occorrenze di
`set-state-in-effect` e di `exhaustive-deps` — solo 67 `no-unused-vars` e 4 `incompatible-library`.
Nella **7.1.1 le stesse righe diventano errori bloccanti**: al primo aggiornamento legittimo del
plugin — che arriverà con un `npm update` o dietro Next — **la CI si ferma su 40 errori**.

> **Attenzione a non concludere che il problema non esista.** Cercandole oggi non si trova nulla, ed
> è precisamente ciò che rende questo debito insidioso. Che le righe siano reali lo dimostra un
> dettaglio indipendente: nel codice **esistono già deroghe scritte a mano** per quella regola —
> `scadenzario/regole/page.tsx:55`, `scadenzario/ricorrenze/page.tsx:45`,
> `create-schedule-sheet.tsx:170`, `saldo-scalare-panel.tsx:70`, `create-recurrence-dialog.tsx:129` —
> e con la 7.0.1 il linter le segnala come *inutili* ("no problems were reported"). Qualcuno le ha
> messe perché la regola scattava; oggi non scatta più; domani riscatterà.

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

## Gruppo 1 — `set-state-in-effect`: 29 occorrenze (il grosso del lavoro)

> Erano 30. **`src/app/(dashboard)/cash-flow/page.tsx:78` è già stata estinta** in W3 da C4, che ha
> riscritto la pagina con TanStack Query: nessun `useEffect`, i `useState` rimasti tengono solo i
> filtri di data. È esattamente il rimedio proposto qui sotto al punto 1, e vale come prova che
> funziona.

```
src/app/(auth)/invito/page.tsx:45
src/app/(auth)/login/page.tsx:52
src/app/(auth)/reset-password/page.tsx:30
src/app/(dashboard)/anagrafiche/clienti/page.tsx:62,86
src/app/(dashboard)/anagrafiche/utenti/page.tsx:55,86
src/app/(dashboard)/budget/BudgetList.tsx:123
src/app/(dashboard)/budget/[id]/BudgetDetailClient.tsx:120
src/app/(dashboard)/budget/confronto/BudgetConfrontoClient.tsx:192
src/app/(dashboard)/chiusura-cassa/ClosureList.tsx:155
src/app/(dashboard)/fatture/page.tsx:69
src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx:137
src/app/(dashboard)/prima-nota/pagamenti/PagamentiClient.tsx:63
src/app/(dashboard)/report/incassi-giornalieri/DailyRevenueClient.tsx:229
src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx:84
src/app/(dashboard)/turni/[id]/page.tsx:117
src/components/portal/PunchButton.tsx:291
src/components/prima-nota/movimenti/SplitEntryDialog.tsx:80
src/components/prima-nota/regole/CategorizationProposalsDialog.tsx:76
src/components/prima-nota/regole/CategorizationRulesManager.tsx:85
src/components/reconciliation/MatchDialog.tsx:72
src/components/reconciliation/TransactionDetailsDialog.tsx:103
src/components/scadenzario/payment-dialog.tsx:70
src/components/settings/VenueManagement.tsx:69
src/components/ui/address-autocomplete.tsx:60
src/components/ui/payee-autocomplete.tsx:58,64
src/hooks/useOffline.ts:49
```

## Gruppo 2 — `exhaustive-deps`: 8 occorrenze (errori)

Dipendenze di effetti dichiarate male: rimedio diverso, spesso la dipendenza va aggiunta o l'effetto
va eliminato del tutto.

```
src/components/scadenzario/create-schedule-sheet.tsx:231
src/components/settings/AccountMappingManager.tsx:186,192
src/components/settings/BancheEContiClient.tsx:104
src/components/settings/BudgetCategoryManagement.tsx:115,121,122
src/components/settings/SupplierManagement.tsx:112
```

## Gruppo 3 — un caso ciascuno

- `preserve-manual-memoization`: `src/components/chiusura/ClosureForm.tsx:122`
- `immutability`: `src/components/portal/NotificationSettings.tsx:52`

## Gruppo 4 — restano avvisi anche nella 7.1.1 (non bloccano)

- `incompatible-library`, 5: `LeaveRequestForm.tsx:235`, `MovimentoFormDialog.tsx:105`,
  `PagamentoFormDialog.tsx:279`, `RegolaFormDialog.tsx:98`, `UserForm.tsx:115`. Tutti sul `watch()`
  di react-hook-form, che restituisce funzioni non memoizzabili dal React Compiler: **verosimilmente
  non risolvibili**. Vanno esclusi con una deroga motivata, non "corretti".
- `exhaustive-deps`, 1: `create-recurrence-dialog.tsx:147`.
