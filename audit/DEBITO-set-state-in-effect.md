# Debito: regole React Compiler — estinto, tranne una deroga ora dichiarata

**Rilevato:** 7 agosto 2026, durante la W3. **Lotto D3:** 8 agosto 2026, in W4.
**Lotto E3:** 8 agosto 2026, in W4 fase 3 — i `queueMicrotask` nascosti.

**Stato:** `eslint-plugin-react-hooks` è alla **7.1.1**, dipendenza diretta e pinnata in
`package.json`, e `npx eslint src` riporta **zero errori**. Le 43 violazioni bloccanti sono corrette.

Degli **otto `queueMicrotask`** che nascondevano la stessa cascata di render, **sette sono estinti**
correggendo il difetto sotto; l'ottavo — `AttendanceSection` — non rientra in nessuno dei tre schemi
di rimedio ed è diventato una **deroga dichiarata** con la motivazione scritta accanto al codice.
Il dettaglio, e perché la classificazione originale di questo documento era sbagliata su due casi,
sta in fondo.

La differenza che conta: prima il difetto era invisibile a `grep` e al linter; ora l'unico rimasto è
entrambe le cose.

## Cos'era

Chiamare `setState` **sincronamente dentro un effetto** innesca un secondo render immediato: il
componente si disegna, l'effetto parte, lo stato cambia, il componente si ridisegna. Su una tabella
o una pagina con più effetti concatenati diventa una cascata di render che l'utente percepisce come
lentezza o sfarfallio.

## Perché è rimasto invisibile, ed è la parte che vale la pena ricordare

Il progetto non se ne accorgeva perché con `eslint-plugin-react-hooks` **7.0.1 la regola non si
attiva affatto**. Il plugin non era una dipendenza diretta: arrivava per via transitiva da
`eslint-config-next`, quindi la versione effettiva dipendeva da come npm risolveva l'albero. Nessuno
l'aveva scelta, e nessuno si accorgeva che cambiasse.

Sopra a questo si erano stratificati due modi di zittire il controllo, entrambi in buona fede:

- **cinque `eslint-disable` scritti a mano** per `set-state-in-effect` (in `scadenzario/regole`,
  `scadenzario/ricorrenze`, `create-schedule-sheet`, `saldo-scalare-panel`,
  `create-recurrence-dialog`), messi da chi vedeva la regola scattare, e che con la 7.0.1 il linter
  segnalava addirittura come *inutili*;
- **nove `queueMicrotask`** che spostavano il `setState` fuori dal corpo sincrono dell'effetto: la
  regola smette di vederlo, la cascata di render resta. Il lotto D3 ne ha tolto uno, in
  `PunchButton`; gli altri otto sono ancora lì, elencati in fondo.

La lezione: quando il numero di segnalazioni scende, prima di festeggiare va controllato **se è
sceso il difetto o la capacità di vederlo**.

## Cosa si è trovato davvero, contro cosa diceva questo documento

La stima di questo documento era di 40 occorrenze, poi corrette in 39. Alzando il plugin alla 7.1.1
prima di toccare il codice — che è stato il primo commit del lotto, proprio per misurare invece di
fidarsi — sono emersi **43 errori bloccanti**. La ripartizione per regola era diversa da quella
scritta qui:

| regola | diceva il documento | era davvero |
|---|---|---|
| `set-state-in-effect` | 29 errori | **36 errori** |
| `exhaustive-deps` | 8 errori | **1 warning** (non blocca) |
| `immutability` | 1 errore | **6 errori** |
| `preserve-manual-memoization` | 1 errore | 1 errore |
| `incompatible-library` | 5 warning irrisolvibili | **5 warning, tutti risolti** |

Gli errori attribuiti a `exhaustive-deps` erano in realtà `immutability` (funzioni usate prima di
essere dichiarate) e `set-state-in-effect`. E ai 43 vanno aggiunte le occorrenze nascoste dalle
cinque deroghe, che nessun conteggio poteva vedere.

**Le `incompatible-library` non erano irrisolvibili.** `react-hook-form` offre `useWatch`, che è
l'equivalente memoizzabile di `form.watch(nome)`. La cosa contava più di un avviso in meno: il
messaggio della regola è *"Compilation Skipped"*, cioè finché c'è il compiler **non analizza affatto
quel componente** e nessun'altra regola gira su di esso. Appena `UserForm` è tornato analizzabile è
emersa una violazione di `set-state-in-effect` che nessuno aveva mai visto. Mettere a tacere quegli
avvisi, come questo documento proponeva, avrebbe lasciato cinque componenti fuori dai controlli.

## Come è stato affrontato

Un commit per gruppo, non per file:

1. l'aggiornamento del plugin alla 7.1.1, che rende visibile il debito;
2. lo stato derivato calcolato durante il render invece che in un effetto;
3. il caricamento dati passato a **TanStack Query** (18 file), che il progetto già usava altrove;
4. le funzioni usate prima di essere dichiarate, nei manager delle impostazioni;
5. le pagine di autenticazione;
6. lo stato del browser letto con `useSyncExternalStore` invece che copiato;
7. il portale e la memoizzazione manuale di `ClosureForm`;
8. i sei dialog il cui form era riallineato da un effetto, ora rimontati con una `key`;
9. `watch()` → `useWatch`;
10. le ultime tre deroghe scritte a mano.

Due trappole incontrate, che valgono per chi farà conversioni simili:

- **L'oggetto restituito da `useMutation` cambia identità a ogni render.** Usarlo come dipendenza di
  un effetto che lo invoca produce un ciclo infinito. Vanno usati `mutate` e `isPending`, che
  TanStack Query mantiene stabili.
- **`refetchOnMount: 'always'` non basta.** Copre il montaggio, ma quando cambia la `queryKey` a
  componente montato il ricaricamento passa da `shouldFetchOptionally`, subordinato alla staleness.
  Con lo `staleTime` globale di 60s si sarebbe tornati su un filtro usato da meno di un minuto
  vedendo dati vecchi. Serve `staleTime: 0` accanto, ed è così in tutte le 22 query del lotto.

## Cosa resta aperto

### 1. Gli otto `queueMicrotask`: sette estinti, uno dichiarato

`queueMicrotask(() => setState(...))` dentro un effetto sposta il `setState` fuori dal corpo
sincrono: la regola smette di vederlo, **la cascata di render resta identica**. Non era una
soluzione, era un modo di non essere segnalati.

Che siano nati così è documentato: `src/components/shifts/CLAUDE.md` conserva la voce *"Wrapped
setState calls in queueMicrotask for AssignmentDialog form initialization"*, accanto a *"Fixed all 18
remaining ESLint errors"*. Diciotto errori di lint sono stati chiusi in questo modo.

Prima di toccare il codice ne è stato tolto uno di prova per misurare invece di fidarsi: la regola
**vede attraverso la `useCallback`** e segnala anche quando l'effetto si limita a invocare una
funzione che fa `setState` al suo interno. Erano quindi violazioni vere, tutte e otto.

| file (riga di allora) | rimedio applicato |
|---|---|
| `settings/AccountManagement.tsx:107` | TanStack Query, `showInactive` nella `queryKey` |
| `settings/PrimaNotaSettings.tsx:108` | TanStack Query, due query (sedi e saldi) |
| `invoices/InvoiceDetail.tsx:188,190` | calcolo durante il render, con la scelta dell'utente che ha la precedenza |
| `invoices/InvoiceImportDialog.tsx:257` | calcolo durante il render (la sede predefinita è la prima caricata) |
| `portal/ShiftSwapDialog.tsx:112` | modulo interno rimontato con `key` |
| `shifts/AssignmentDialog.tsx:131` | modulo interno rimontato con `key` |
| `shifts/GenerationParamsForm.tsx:65` | effetto eliminato: era ridondante |
| `chiusura/AttendanceSection.tsx:355` | **deroga dichiarata** (sotto) |

**Due classificazioni di questo documento erano sbagliate**, e vale la pena saperlo prima di fidarsi
di un elenco simile:

- `AttendanceSection:355` non è «carico i dati e li metto nello stato»: **in quell'effetto non c'è
  nessuna fetch**. Turni e timbrature arrivano già da due `useQuery`; l'effetto pre-compila le
  presenze e lo notifica al genitore con `onChange`. Mandarlo a TanStack Query non ha senso.
- `InvoiceImportDialog:257` non è «riallineo il form all'apertura del dialog»: sceglie la sede
  predefinita quando l'elenco sedi arriva. È lo stesso caso di `InvoiceDetail`, non di un dialog da
  rimontare.

### 1-bis. La deroga che resta: `AttendanceSection`

`loadFromSchedule` fa due cose insieme: avvisa il genitore (`onChange`) e registra **localmente** che
il caricamento è avvenuto (`setHasLoadedFromSchedule`). È il secondo che la regola vede — il primo
no, tanto che l'effetto subito sotto chiama `onChange` in modo sincrono e passa il lint.

Nessuno dei tre schemi si applica: non è un caricamento dati, non è uno stato derivato da una prop
(l'elenco presenze vive nel genitore), non è un form da rimontare. E soprattutto **la cascata di
render resterebbe comunque**, perché `onChange` aggiorna lo stato del genitore: eliminarla richiede
spostare `hasLoadedFromSchedule` accanto ad `attendance` dentro il form della chiusura.

Le due strade tentate e scartate, per non farle ritentare a vuoto:

- **flag derivato dai dati** (`attendance.some(r => r.shiftCode)`) più latch in una `ref`: funziona,
  ma dipende dal fatto che le righe da turno abbiano sempre `shiftCode` valorizzato, e cambia un
  caso limite (cancellate tutte le righe, il banner «Carica da turni» ricompare).
- **eliminare l'effetto**: la pre-compilazione automatica sparirebbe.

Resta quindi una `eslint-disable-next-line` **cercabile**, con la motivazione accanto. È debito, ma
dichiarato. Scioglierlo è una modifica di disegno del form di chiusura, da concordare.

### 2. Una `incompatible-library` in `MovimentoFormDialog.tsx`

Righe 105 e 381. Il file apparteneva a un altro agente durante il lotto e non è stato toccato.
Si risolve come le altre quattro: `form.watch(nome)` → `useWatch({ control: form.control, name })`.
Dopo la conversione **va rifatto il lint**, perché rendendo il componente analizzabile possono
emergere violazioni finora invisibili — è successo con `UserForm`.

## Come impedire che rientri

`eslint-plugin-react-hooks` è ora una **dipendenza diretta e pinnata** in `package.json`: non può più
cambiare versione da sola dietro `eslint-config-next`. Il lint fa parte del gate e del pre-commit
hook, e con la 7.1.1 queste regole sono errori bloccanti.

Se in futuro il conteggio delle segnalazioni scende senza che nessuno abbia corretto nulla, la prima
ipotesi da verificare non è che il codice sia migliorato.

E vale anche al contrario: **il lint verde non è la prova che il difetto non ci sia**, come hanno
mostrato gli otto `queueMicrotask`. Un controllo dice solo ciò che sa guardare.

Corollario pratico, dal lotto E3: quando una deroga è inevitabile, va scritta come deroga. Una
`eslint-disable` con la motivazione accanto si trova con un `grep` e si discute; un
`queueMicrotask` no, e infatti è rimasto lì per mesi.
