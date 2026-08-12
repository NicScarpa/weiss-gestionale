# Grafico del cash flow: disegnare la zona negativa invece di descriverla

`KPI-03` · impatto 3 · effort **S** · quick win #10

✅ **Chiuso nell'Onda 1** (commits `b1056d9..8dcdd52`, 11-12 agosto 2026). La
soglia mostrata resta duplicata fra due schermate (difetto adiacente, non di
questo ticket): `../02-matrice-5vie.md` riga `KPI-03`.

## Contesto

`CashFlowChart` ha già una `ReferenceLine` orizzontale sulla soglia minima e una
verticale su «Oggi» (`src/components/cashflow/CashFlowChart.tsx:79-91`). Manca
l'**area**: sotto lo zero non c'è nulla che marchi visivamente il pericolo, e per
capire se la curva ci entra bisogna leggere l'asse.

## Cosa fa Cash King

Sul «Radar di Liquidità», una banda **«Zona Negativa»** disegnata sotto lo zero.

*«La banda "Zona Negativa" disegna il rischio invece di descriverlo: si vede a
colpo d'occhio se la curva ci entra.»*

Sotto il grafico, in chiaro, anche: **«Punto minimo: 170.720,95 € (20 ago 2026)»**
— che da noi esiste già come dato (`summary.minBalance` + `minBalanceDate`) ed è
mostrato in `CashFlowSourcePanel`, ma non sul grafico.

## Cosa fare

**`src/components/cashflow/CashFlowChart.tsx`**

1. Aggiungere `ReferenceArea` all'import da `recharts` (il file importa già
   `ReferenceLine` dallo stesso pacchetto).
2. Una `<ReferenceArea y1={minimoAsseY} y2={0} fill="#ef4444" fillOpacity={0.08}
   />` sotto le `ReferenceLine` esistenti, resa solo quando il minimo della serie
   è negativo — altrimenti è una banda vuota che confonde.
3. Opzionale, stesso costo: una seconda area fra `0` e `sogliaMinima` in ambra,
   che è la «liquidità bassa» di Agicap.
4. Annotare il punto minimo sul grafico con un `<ReferenceDot>` e l'etichetta,
   riusando `summary.minBalance` / `minBalanceDate` che il chiamante ha già.

## Criteri di accettazione

- [ ] Con una serie interamente positiva **nessuna** banda rossa compare.
- [ ] Con una serie che va sotto zero la banda compare e la curva si vede
      entrarci.
- [ ] La banda non copre la curva (opacità bassa, resa prima dell'`Area`).
- [ ] La `ReferenceLine` esistente su «Oggi» e quella sulla soglia restano.
- [ ] Il grafico resta leggibile in tema scuro.

## File coinvolti

- `src/components/cashflow/CashFlowChart.tsx`

## Evidenza

- `docs/cashking/02-aree-funzionali/02-02-liquidita-e-previsionale.md` §3, §6
- `docs/agicap/04-logiche-di-calcolo.md` §3 (le celle arancioni per periodo)
- Screenshot: `assets/cashking/screenshots/06-cash-command-radar-liquidita.png`
