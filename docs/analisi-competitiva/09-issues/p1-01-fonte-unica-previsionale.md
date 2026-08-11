# Previsionale: una sola fonte, con una gerarchia di affidabilità dichiarata

`PRV-03` + `PRV-01` + `PRV-04` · impatto **5** · effort M

## Contesto

Tre rotte rispondono alla domanda «quanti soldi avrò», con basi diverse e nessun
raccordo:

| Rotta | Base | Orizzonte |
|---|---|---|
| `/api/dashboard/forecast` | spese ricorrenti + storico chiusure | 30 gg (max 90) |
| `/api/scadenzario/saldo-scalare` | scadenze aperte | 90 gg |
| `/api/cashflow/projection` | movimenti già registrati | finestra libera |

**La causa è più a monte**: esistono **due modelli disgiunti della stessa cosa** —
un'uscita che si ripete.

| Modello | Chi lo scrive | Chi lo legge |
|---|---|---|
| `RecurringExpense` (`prisma/schema.prisma:1836`) | `/spese-ricorrenti` | **solo** `/api/dashboard/forecast` |
| `Recurrence` → genera `Schedule` (`prisma/schema.prisma:761`) | `/scadenzario/ricorrenze` | **solo** `/api/scadenzario/saldo-scalare` |

Verificato: **nessun percorso converte l'uno nell'altro**
(`grep -rn recurringExpense src` restituisce il CRUD e la sola rotta forecast).
Due conseguenze, e la seconda è la peggiore:

1. L'affitto inserito in **una sola** delle due pagine **sparisce** dall'altra
   proiezione. Nessuna delle due schermate mostra mai il quadro completo.
2. L'affitto inserito in **entrambe** viene **contato due volte** — cosa del tutto
   plausibile, visto che le due pagine esistono entrambe, si chiamano quasi allo
   stesso modo e nessuna nomina l'altra.

È la stessa famiglia di difetto che l'analisi rimprovera a Cash King — tre
endpoint, tre valori per lo stesso saldo. Il fatto che ce lo siamo fatti da soli
non lo rende meno grave.

## Cosa fanno loro

Due meccanismi diversi per lo stesso problema, e convergono sul principio:
**quando due fonti prevedono lo stesso flusso, una sola deve vincere.**

**Agicap** spegne le ricorrenze nel breve termine, con l'opzione «Disattivare le
transazioni ricorrenti in attesa per un periodo mobile a breve termine» e questa
glossa: *«Corrisponde al periodo mobile in cui le previsioni sono coperte da
altre fonti (ad es. pagamenti programmati)»*. L'analisi ne ricava la gerarchia
esplicita: **movimento reale > pagamento programmato > ricorrenza stimata**.

**Trezy** tiene tre stime concorrenti della stessa cella (previsione manuale,
fatture future, fatture scadute) e ne **sceglie** una via `pickedSource`, invece
di sommarle. *«Tenere separate le tre fonti invece di sommarle è corretto —
sommare budget e fatture aperte è il modo classico di contare due volte lo stesso
incasso.»*

**Il difetto da non copiare da Trezy**: `pickedSource` esiste nel payload e **non
affiora mai nell'interfaccia**. L'utente non vede quale fonte ha vinto né perché.

## Cosa fare

0. **Decidere quale dei due modelli ricorrenti sopravvive.** È la scelta che
   viene prima del codice. Raccomandazione: **`Recurrence` vince**, perché genera
   `Schedule` vere — quindi riconciliabili, con data attesa stimabile, con
   priorità e allegati — mentre `RecurringExpense` produce solo una riga in un
   grafico. `RecurringExpense` diventa allora una **sorgente di primo
   inserimento** che genera una `Recurrence`, oppure si migra e si dismette.

1. **Una funzione di proiezione unica** in `src/lib/previsionale/proietta.ts`,
   che riceve una finestra e restituisce la serie giornaliera applicando questa
   gerarchia:

   | Priorità | Fonte | Regola |
   |---|---|---|
   | 1 | `JournalEntry` registrato | vince sempre: il denaro si è mosso |
   | 2 | `Schedule` aperta | vince sulla `Recurrence` che l'ha generata: se la scadenza esiste, l'occorrenza no |
   | 3 | ricorrente non ancora scadenzata | proietta **solo oltre** l'ultima `Schedule` generata da quella ricorrenza |

   La regola 3 è ciò che rende sicura la coesistenza durante la transizione:
   finché `RecurringExpense` esiste, va confrontata con le `Schedule` esistenti
   per descrizione e importo, e in caso di sovrapposizione **la scadenza vince**.

2. **Ogni punto della serie porta la propria fonte** (`fonte: 'movimento' |
   'scadenza' | 'ricorrenza'`), e la fonte **si vede**: colore o tratteggio
   diverso nel grafico, legenda esplicita. È il correttivo al difetto di Trezy.

3. **Le tre rotte restano come viste**, con finestre e aggregazioni diverse, e
   chiamano tutte la stessa funzione. Nessuna calcola più per conto proprio.

4. Test in `src/lib/previsionale/__tests__/`: il caso da coprire per primo è
   *spesa ricorrente mensile che ha già generato la scadenza del mese prossimo →
   il mese prossimo compare una volta sola*.

## Criteri di accettazione

- [ ] Un'uscita ricorrente presente **in entrambi** i modelli compare **una sola
      volta** nella proiezione.
- [ ] Un'uscita ricorrente presente in **uno solo** dei due modelli compare in
      **tutte** le proiezioni, non solo in quella che legge quel modello.
- [ ] Le tre rotte, interrogate sulla stessa finestra, restituiscono la stessa
      serie.
- [ ] Il grafico distingue visivamente movimento / scadenza / ricorrenza.
- [ ] La gerarchia è documentata in testa al modulo, come `src/lib/saldi.ts`.
- [ ] La funzione è pura o testabile senza database per la parte di arbitraggio.
- [ ] Nessuna regressione sui totali già verificati (`saldo-scalare` somma il
      residuo, non l'importo).

## Perché è impatto 5

Non è comodità: oggi il gestionale può mostrare un numero sbagliato — un'uscita
contata due volte — e nessuna schermata lo dichiara. È la stessa classe di
difetto che l'analisi giudica più grave nei concorrenti.

## File coinvolti

- `src/lib/previsionale/` (nuovo)
- `src/app/api/dashboard/forecast/route.ts`
- `src/app/api/scadenzario/saldo-scalare/route.ts`
- `src/app/api/cashflow/projection/route.ts`
- `src/components/cashflow/CashFlowChart.tsx`
- `src/components/cashflow/CashFlowSourcePanel.tsx`

## Evidenza

- `docs/agicap/02-aree-funzionali/02-03-transazioni-attese-e-ricorrenze.md` §3
- `docs/trezy/02-aree-funzionali/02-01-cashflow-previsioni-scenari.md` §4.3
- `docs/cashking/02-aree-funzionali/02-02-liquidita-e-previsionale.md` §5.1, §6
- Modello nostro da imitare: `src/lib/saldi.ts:6-42`
