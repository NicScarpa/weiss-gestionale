# Prima nota: raggruppare i movimenti simili e renderlo la leva della categorizzazione

`MOV-06` · impatto 4 · effort M

## Contesto

Ogni movimento è un caso a sé. Categorizzare 88 accrediti POS con la stessa
causale richiede 88 gesti, oppure una regola scritta a mano — e per scriverla
bisogna prima accorgersi che quegli 88 movimenti esistono e si somigliano.

Il suggeritore di regole (`/api/categorization-rules/proposals`) fa già qualcosa
di simile lato server, raggruppando per controparte o descrizione con soglia ≥2.
Ma il raggruppamento vive dentro un dialog: **nella lista dei movimenti non c'è
alcun segno** che una riga ne rappresenti altre 87.

## Cosa fa Trezy

Un badge grigio con un'icona a strati e un numero accanto alla descrizione: 173,
149, 57, 5, 4, 3, 2. Omesso quando vale 1.

Il meccanismo, verificato su tre riscontri indipendenti:

- il campo `similarTransactionsCount` nella risposta API coincide col badge;
- ogni transazione porta un `transaction_hash` (SHA-256) calcolato sulla
  **descrizione normalizzata** — rimosse le cifre variabili — e tutte le righe
  con badge 173 condividono lo stesso hash pur avendo descrizioni testualmente
  diverse;
- il gruppo **attraversa i conti**: la similarità è sulla causale, non per conto.

Perché conta: *«Categorizzare una riga con badge 173 significa dichiarare la
categoria di 173 movimenti. È l'elemento di interfaccia con il maggior rapporto
tra spazio occupato e potere esercitato.»*

**Il difetto da non copiare**, che l'analisi segnala nella stessa pagina: *«ed è
anche il più silenzioso: nulla nella riga spiega che cosa accadrà.»* Cambiare la
categoria su una riga con badge 173 ha effetti su 173 movimenti e la riga non lo
dice.

Agicap fa la stessa cosa in un altro punto: mostra «88 transazioni
corrispondenti» **dentro l'anteprima della regola**, cioè al momento della
decisione.

## Cosa fare

1. **Normalizzazione e hash** — funzione pura in
   `src/lib/prima-nota/similarita.ts`: rimuovere cifre, date compatte e
   identificativi variabili dalla descrizione, poi hash. Il criterio effettivo di
   Trezy è *«stessa forma di causale e stessa controparte testuale»*: il nome del
   beneficiario **sopravvive** alla normalizzazione, ed è giusto così.
2. **Colonna `descriptionHash`** su `JournalEntry`, calcolata alla scrittura e
   indicizzata. In alternativa il conteggio si può fare a query, ma su una lista
   paginata costa una scansione: la colonna è più economica.
3. **Badge nella lista** con il conteggio, omesso quando vale 1.
4. **Il correttivo al difetto di Trezy**: al click sul badge, un'azione esplicita
   «Categorizza tutti gli N simili» **con conferma che dichiara il numero**, non
   una propagazione silenziosa quando si cambia la categoria di una riga.
   Cambiare una riga cambia una riga.

## Criteri di accettazione

- [ ] Due movimenti con la stessa causale a meno degli identificativi numerici
      hanno lo stesso hash.
- [ ] Due bonifici verso beneficiari diversi hanno hash diversi.
- [ ] Il badge non compare quando il gruppo ha un solo elemento.
- [ ] Il gruppo attraversa i registri e i conti.
- [ ] L'azione di massa chiede conferma dichiarando quanti movimenti tocca.
- [ ] Cambiare la categoria di una singola riga **non** propaga nulla.
- [ ] La funzione di normalizzazione è pura e testata su causali bancarie reali.

## Cosa sblocca

`PRV-09` — il rilevamento automatico delle ricorrenze dai movimenti, che ha
bisogno proprio dei gruppi di simili per riconoscere una cadenza.

## File coinvolti

- `src/lib/prima-nota/similarita.ts` (nuovo) + test
- `prisma/schema.prisma` + migrazione
- `src/app/api/prima-nota/route.ts`
- `src/components/prima-nota/movimenti/MovimentiClient.tsx`

## Evidenza

- `docs/trezy/02-aree-funzionali/02-03-transazioni-categorizzazione.md` §1.3, §9.10
- `docs/agicap/02-aree-funzionali/02-01-categorizzazione-e-regole.md` §2
