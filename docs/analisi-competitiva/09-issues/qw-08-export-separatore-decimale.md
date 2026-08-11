# Export scadenzario: gli importi arrivano a Excel come testo

`RPT-04` · impatto 3 · effort **S** · quick win #8

## Contesto

`src/app/api/scadenzario/export/route.ts:68-71` scrive gli importi con
`.toFixed(2)`, cioè col **punto** come separatore decimale, e usa `;` come
separatore di campo:

```ts
Number(s.importoTotale).toFixed(2),
Number(s.importoPagato).toFixed(2),
(Number(s.importoTotale) - Number(s.importoPagato)).toFixed(2),
```

Su Excel con impostazioni locali italiane — dove `;` è il separatore di lista e
`,` il separatore decimale — quei valori arrivano come **testo** e non si possono
sommare. È esattamente la seccatura che un export dovrebbe evitare.

**L'export della prima nota è già corretto** e usa la funzione giusta
(`src/app/api/prima-nota/export/route.ts:301-308`):

```ts
return num.toLocaleString('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
```

È quindi un'incoerenza interna fra due rotte, non una lacuna di progetto.

## Cosa fa (male) Cash King

Stesso difetto, con un'aggravante: il loro CSV col punto decimale **ignora
l'impostazione `decimalNotation: comma` che il prodotto stesso offre**.
*«Se offriamo l'impostazione, ogni export deve rispettarla.»*

Il BOM UTF-8 in testa al file, invece, è la cosa che fanno bene — *«è ciò che fa
aprire correttamente le lettere accentate a Excel in ambiente italiano, e costa
tre byte»* — e **ce l'abbiamo già** su entrambe le rotte.

## Cosa fare

1. Spostare `formatNumber` da `src/app/api/prima-nota/export/route.ts` a
   `src/lib/formatters.ts`, come `formatNumberCsv` (o simile). Il file contiene
   già `formatCurrency`, `formatCurrencyOrDash`, `formatCurrencyPdf`: è il posto
   giusto.
2. Usarla in `src/app/api/scadenzario/export/route.ts` al posto dei tre
   `.toFixed(2)`.
3. Usarla in `prima-nota/export`, che ora la definisce localmente.
4. Un test in `src/lib/__tests__/formatters.test.ts`: `1234.5` → `"1.234,50"`.

Farlo come funzione condivisa e non come fix locale è il punto: il terzo export
che qualcuno scriverà nascerà giusto.

## Criteri di accettazione

- [ ] Il CSV dello scadenzario aperto con Excel italiano mostra gli importi come
      **numeri**, sommabili.
- [ ] Il BOM UTF-8 resta in testa a entrambi i file.
- [ ] Il separatore di campo resta `;`.
- [ ] Gli accenti nelle descrizioni restano corretti.
- [ ] `formatNumberCsv` è testata e usata da entrambe le rotte.

## Da fare insieme

**`RPT-10`** — riga dei totali nell'export. È nello stesso file e nello stesso
spirito: *«l'export vale quanto la schermata, non meno»*. Cash King espande anche
le sigle («0/2» diventa «0 migliori / 2 peggiori») perché il file si legge senza
aver visto la pagina.

## File coinvolti

- `src/lib/formatters.ts`
- `src/lib/__tests__/formatters.test.ts`
- `src/app/api/scadenzario/export/route.ts`
- `src/app/api/prima-nota/export/route.ts`

## Evidenza

- Difetto nostro: `src/app/api/scadenzario/export/route.ts:68-71`
- Riferimento corretto: `src/app/api/prima-nota/export/route.ts:301-308`
- `docs/cashking/02-aree-funzionali/02-06-stampe-import-pianificazione.md` §5
