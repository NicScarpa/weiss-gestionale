# Proposte di regola: mostrare le righe che verrebbero colpite

`CLS-06` · impatto 3 · effort **S** · quick win #15

## Contesto

`CategorizationProposalsDialog` mostra già la keyword e **«N risultati»**
(`src/components/prima-nota/regole/CategorizationProposalsDialog.tsx:196`): il
conteggio dell'impatto c'è. Manca l'elenco: l'utente sa che la regola toccherà
88 movimenti e non sa **quali**.

Il dato è già in memoria: la GET raggruppa i movimenti non categorizzati e
restituisce `matchingEntryIds`, quindi le descrizioni sono lette dal database e
poi buttate via.

## Cosa fa Agicap

Sotto ogni suggerimento, **l'anteprima delle transazioni** che verrebbero
colpite, col **pattern evidenziato in giallo** dentro il testo della causale.

*«L'utente vede esattamente cosa sta per succedere e perché quella regola aggancia
quelle righe. Rimuove la paura di applicare una regola sbagliata su centinaia di
movimenti.»*

Va detto che la scommessa di prodotto di Agicap è tutta qui: la loro grammatica
delle regole è povera (due campi, tre operatori testuali), e in cambio danno **66
regole già scritte** dall'analisi dei dati dell'utente. *«La potenza sta nel
suggeritore, non nel costruttore.»* Il nostro suggeritore è già la stessa idea; è
l'anteprima che gli manca per essere convincente.

## Cosa fare

1. **`src/app/api/categorization-rules/proposals/route.ts`** — aggiungere a ogni
   proposta un campo `sampleDescriptions: string[]` con le prime 3 descrizioni
   del gruppo. Costo zero: i movimenti sono già nell'array `uncategorized` dentro
   la funzione, basta non scartarli quando si costruisce il gruppo.
2. **`src/components/prima-nota/regole/CategorizationProposalsDialog.tsx`** — sotto
   il conteggio, le tre righe con `<mark>` sulla porzione che corrisponde alla
   keyword.
3. Troncare le descrizioni lunghe con ellissi **preservando la porzione
   evidenziata**: le causali bancarie sono lunghe e la parte che conta non è
   sempre all'inizio.

## Criteri di accettazione

- [ ] Ogni proposta mostra fino a 3 descrizioni di esempio.
- [ ] La keyword è evidenziata dentro ciascuna, case-insensitive.
- [ ] Le descrizioni troncate mantengono visibile la parte evidenziata.
- [ ] Il conteggio esistente resta invariato.
- [ ] La risposta della GET non cresce oltre il ragionevole (3 stringhe per
      gruppo, non l'elenco intero).

## Nota di sequenza

Da fare **insieme a `CLS-09`** (`qw-07-anteprima-impatto-regola.md`): è la stessa
idea applicata al suggeritore invece che al costruttore, e i due componenti stanno
nella stessa cartella. L'evidenziazione si scrive una volta e si usa in entrambi.

## File coinvolti

- `src/app/api/categorization-rules/proposals/route.ts`
- `src/components/prima-nota/regole/CategorizationProposalsDialog.tsx`

## Evidenza

- `docs/agicap/02-aree-funzionali/02-01-categorizzazione-e-regole.md` §2, §3
