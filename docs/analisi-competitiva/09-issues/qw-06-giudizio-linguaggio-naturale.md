# Dashboard: un giudizio sintetico in linguaggio naturale sopra i numeri

`KPI-02` · impatto 4 · effort **S** · quick win #6

## Contesto

La dashboard mostra numeri e alert tecnici («Saldo previsto sotto soglia dal
mercoledì 12 agosto»). Nessuna frase risponde alla domanda che il titolare fa
davvero: **devo preoccuparmi?**

Tutti i dati per rispondere ci sono già nella risposta di
`GET /api/dashboard/forecast`: `summary.minBalance`, `summary.minBalanceDate`,
`summary.daysUntilLowBalance`, `settings.lowBalanceThreshold`, `alerts[]`.

## Cosa fa Cash King

Tre giudizi in linguaggio naturale, ciascuno derivato da una soglia sulla curva
proiettata:

| Indicatore | Valore mostrato |
|---|---|
| Stato Cash Flow | «Nessuna tensione prevista» |
| Linea di Credito | «Non necessaria» |
| Acid Test di Cassa | «12+ mesi — Stabile», con messaggio discorsivo |

*«Sono le due domande che un imprenditore fa davvero, e tradurre i numeri in
quelle due risposte è un accorgimento a costo quasi nullo.»*

## Cosa fare

**`src/components/dashboard/CashFlowForecast.tsx`** — una riga di testo sopra le
card, derivata dai dati già disponibili. Tre stati bastano:

| Condizione | Frase |
|---|---|
| `minBalance >= lowBalanceThreshold` | «Nessuna tensione prevista nei prossimi 30 giorni.» |
| `minBalance < lowBalanceThreshold` e `>= 0` | «Attenzione: il saldo scende sotto la soglia il <data per esteso>, fino a <importo>.» |
| `minBalance < 0` | «Tensione prevista: il saldo va in negativo il <data per esteso>.» |

Usare `dataEstesa()`, che **esiste già** in
`src/app/api/dashboard/forecast/route.ts:40-42` e produce «mercoledì 12 agosto»
invece della forma corta.

### Il correttivo che i nostri concorrenti non hanno

**Da non copiare da Cash King**: il loro giudizio resta «Nessuna tensione
prevista» con **54.281 € di fornitori scaduti**, perché guarda solo alla
proiezione del saldo e ignora l'anzianità dei debiti. L'analisi lo segnala come
difetto: *«il giudizio ignora la dimensione reputazionale e contrattuale del
ritardo.»*

Il nostro deve tenerne conto: leggere `totaleScaduteImporto` da
`/api/scadenzario/summary` (già chiamato dalla sidebar) e, se lo scaduto passivo
supera una soglia, aggiungere una seconda frase — «…ma ci sono <importo> di
scadenze passive già scadute».

## Criteri di accettazione

- [ ] La frase compare sopra le card della dashboard ed è leggibile senza
      guardare i numeri.
- [ ] La data è per esteso («mercoledì 12 agosto»), non abbreviata.
- [ ] Con scaduto passivo rilevante la frase lo dice, anche quando la proiezione
      è serena.
- [ ] Nessuna nuova query verso `/api/dashboard/forecast`.
- [ ] Nessuna frase è generata quando i dati non ci sono (stato di caricamento
      esplicito, non una frase falsamente rassicurante).

## File coinvolti

- `src/components/dashboard/CashFlowForecast.tsx`
- eventualmente `src/lib/formatters.ts` se la frase merita una funzione pura
  testabile (consigliato: rende verificabili le soglie)

## Evidenza

- `docs/cashking/02-aree-funzionali/02-03-scadenzario.md` §2, §5.3
- Screenshot: `assets/cashking/screenshots/04-dashboard-completa.png`,
  `assets/cashking/screenshots/20-acid-test-in-stato-di-rischio.png`
