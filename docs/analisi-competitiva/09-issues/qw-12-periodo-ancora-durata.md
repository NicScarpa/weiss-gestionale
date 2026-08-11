# Saldo scalare: selettore di periodo per «parte da» + «durata»

`PRV-15` · impatto 3 · effort **S** · quick win #12

## Contesto

`GET /api/scadenzario/saldo-scalare` accetta un parametro `range` in giorni e
parte **sempre da oggi** (`src/app/api/scadenzario/saldo-scalare/route.ts:26-31`).
Non si può guardare la curva con un po' di passato davanti, che è il modo in cui
si legge una proiezione di cassa: senza contesto, non si sa se la linea sta
salendo o scendendo.

## Cosa fa Cash King

Due gruppi di pulsanti invece delle solite due date:

- **PARTE DA**: Oggi · −15 giorni · −30 giorni · −60 giorni
- **DURATA FINESTRA**: 7 · 14 · 30 · 60 · 90 giorni

più, sul Radar di Liquidità, il preset **«Storico 30gg + Prev. 90gg»**.

*«Scegliere "da dove parto" e "quanto guardo" invece di due date assolute è più
vicino al modo in cui si ragiona in tesoreria, e rende la vista riutilizzabile
senza reimpostare nulla il giorno dopo. Da rubare.»*

E sul preset asimmetrico: *«poco passato per il contesto, molto futuro per la
decisione. È esattamente la finestra che serve, e non è ottenibile con un normale
selettore da/a senza farci pensare l'utente.»*

## Cosa fare

1. **`src/app/api/scadenzario/saldo-scalare/route.ts`** — accettare un parametro
   `from` (offset in giorni rispetto a oggi, negativo per il passato) oltre a
   `range`. La rotta calcola già tutto a partire da `today`: basta parametrizzare
   l'ancora e, sui giorni passati, usare i movimenti già registrati invece delle
   scadenze aperte.
2. **`src/components/scadenzario/saldo-scalare-panel.tsx`** — due `ToggleGroup`
   di shadcn:
   - ancora: Oggi · −15 · −30 · −60
   - durata: 7 · 14 · 30 · 60 · 90
   più un pulsante preset «Storico 30gg + Prev. 90gg» che li imposta entrambi.
3. Persistere la scelta nell'URL (`useSearchParams`), così la vista sopravvive a
   un refresh — è un pezzo gratuito di `PLT-06`.

## Criteri di accettazione

- [ ] Con ancora «−30» il grafico mostra trenta giorni di passato prima di oggi.
- [ ] La parte passata usa i movimenti registrati, non le scadenze aperte
      (altrimenti si vedrebbe il previsto al posto del consuntivo).
- [ ] Il preset imposta entrambi i controlli in un clic.
- [ ] La combinazione scelta finisce nell'URL e sopravvive a un aggiornamento
      della pagina.
- [ ] La combinazione di default resta l'attuale (oggi + 90 giorni), così nessuno
      trova la schermata cambiata.

## File coinvolti

- `src/app/api/scadenzario/saldo-scalare/route.ts`
- `src/components/scadenzario/saldo-scalare-panel.tsx`
- `src/components/scadenzario/saldo-scalare-chart.tsx`

## Evidenza

- `docs/cashking/02-aree-funzionali/02-02-liquidita-e-previsionale.md` §3, §4, §6
- Screenshot: `assets/cashking/screenshots/07-tesoreria-griglia-giornaliera.png`
