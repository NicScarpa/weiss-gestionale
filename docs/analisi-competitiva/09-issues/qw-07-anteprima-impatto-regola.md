# Regole di categorizzazione: anteprima dell'impatto prima di salvare

`CLS-09` · impatto 4 · effort **S** · quick win #7

✅ **Chiuso nell'Onda 1** (commit `b229e48`, 11-12 agosto 2026, insieme a
`CLS-06`).

## Contesto

`POST /api/categorization-rules/test` esiste già, ma il form di creazione della
regola (`RegolaFormDialog.tsx`) non mostra **quanti movimenti** la regola
catturerebbe né **quali**, prima di salvarla. Si scrive una keyword al buio e si
scopre l'effetto dopo.

## Cosa fa Agicap

Per ogni suggerimento di regola mostra:

- il titolo precompilato e modificabile;
- **«88 transazioni corrispondenti»** — l'impatto quantificato, prima di
  applicare;
- **l'anteprima delle transazioni** che verrebbero colpite, **col pattern
  evidenziato in giallo dentro il testo della causale**.

*«L'utente vede esattamente cosa sta per succedere e perché quella regola aggancia
quelle righe. Rimuove la paura di applicare una regola sbagliata su centinaia di
movimenti.»*

## Cosa fare

**`src/components/prima-nota/regole/RegolaFormDialog.tsx`**

1. Chiamare `POST /api/categorization-rules/test` in `debounce` (~400ms) quando
   cambiano `keywords` o `direction`.
2. Mostrare sotto il campo keyword: «**N movimenti corrisponderebbero**».
3. Elencare le prime 5 descrizioni, con `<mark>` sulla porzione che corrisponde
   alla keyword. La keyword è letterale, quindi l'evidenziazione è una
   `String.replace` case-insensitive: non serve nulla di sofisticato.
4. Stato vuoto esplicito quando il conteggio è zero: «Nessun movimento
   corrisponde. La regola varrà solo per i movimenti futuri.» — è
   un'informazione, non un errore.

Verificare prima cosa restituisce oggi `/api/categorization-rules/test`: se
restituisce solo un conteggio, aggiungere le prime N descrizioni; se restituisce
già i movimenti, basta renderli.

## Criteri di accettazione

- [ ] Digitando una keyword il conteggio si aggiorna senza salvare la regola.
- [ ] Il conteggio corrisponde al numero di movimenti che la regola
      effettivamente categorizzerebbe (stessa query dell'applicazione).
- [ ] Le prime 5 descrizioni sono mostrate con la keyword evidenziata.
- [ ] Con zero corrispondenze compare il messaggio esplicito, non una lista
      vuota muta.
- [ ] Il `debounce` evita una chiamata per carattere digitato.

## Nota di sequenza

Conviene farlo **insieme a `CLS-06`** (`qw-15-anteprima-proposte-regola.md`): è
la stessa idea applicata al suggeritore invece che al costruttore, e i due
componenti stanno nella stessa cartella.

## File coinvolti

- `src/components/prima-nota/regole/RegolaFormDialog.tsx`
- `src/app/api/categorization-rules/test/route.ts` (solo se serve estendere la
  risposta)

## Evidenza

- `docs/agicap/02-aree-funzionali/02-01-categorizzazione-e-regole.md` §2
