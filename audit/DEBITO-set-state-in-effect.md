# Debito: regole React Compiler — ESTINTO

**Rilevato:** 7 agosto 2026, durante la W3. **Estinto:** 8 agosto 2026, in W4, lotto D3.
**Stato:** chiuso. `eslint-plugin-react-hooks` è alla **7.1.1**, dipendenza diretta e pinnata in
`package.json`, e `npx eslint src` riporta **zero errori**.

Questo documento resta come racconto di come un debito possa restare invisibile per mesi. Chi cerca
lavoro da fare qui non ne troverà: si vada al paragrafo finale, dove restano due cose aperte.

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
- **due `queueMicrotask`** (in `PunchButton` e `GenerationParamsForm`) che spostavano il `setState`
  fuori dal corpo sincrono dell'effetto: la regola smette di vederlo, la cascata di render resta.

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

1. **Una `incompatible-library` in `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx`**
   (righe 105 e 381). Il file apparteneva a un altro agente durante il lotto e non è stato toccato.
   Si risolve come le altre quattro: `form.watch(nome)` → `useWatch({ control: form.control, name })`.
   Dopo la conversione **va rifatto il lint**, perché rendendo il componente analizzabile possono
   emergere violazioni finora invisibili — è successo con `UserForm`.

2. **Il `queueMicrotask` in `src/components/shifts/GenerationParamsForm.tsx`** (riga ~65). Nessuna
   regola lo segnala, ed è precisamente il motivo per cui è segnalato qui: è la stessa cascata di
   render, scritta in modo che il linter non la veda. Il componente riceve ora il fabbisogno di
   personale già corretto al primo render, quindi l'effetto che lo risincronizza dovrebbe essere
   eliminabile del tutto.

## Come impedire che rientri

`eslint-plugin-react-hooks` è ora una **dipendenza diretta e pinnata** in `package.json`: non può più
cambiare versione da sola dietro `eslint-config-next`. Il lint fa parte del gate e del pre-commit
hook, e con la 7.1.1 queste regole sono errori bloccanti.

Se in futuro il conteggio delle segnalazioni scende senza che nessuno abbia corretto nulla, la prima
ipotesi da verificare non è che il codice sia migliorato.
