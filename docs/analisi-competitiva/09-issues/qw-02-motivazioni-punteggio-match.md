# Riconciliazione: mostrare le motivazioni accanto al punteggio di affinità

`RIC-03` · impatto 4 · effort **S** · quick win #2

✅ **Chiuso nell'Onda 1** (commits `9164c83..7021583`, 11-12 agosto 2026).

## Contesto

`calculateScheduleMatchScore` restituisce un `number`
(`src/lib/reconciliation/schedule-matcher.ts:73-135`). Il pannello di
riconciliazione lo rende come badge percentuale
(`schedule-reconciliation-panel.tsx:192-194`), e basta: l'utente vede «72%» e
deve fidarsi di una scatola nera.

Il punteggio è già composto da contributi indipendenti e nominabili — importo,
data, similarità della descrizione, presenza del numero documento nella causale —
ma quella composizione muore dentro la funzione.

## Cosa fa Cash King

Accanto al punteggio, le frasi che lo giustificano:

```
MOVIMENTO BANCA                     RATA RICORRENTE
Addebito Telecom Italia             Telefonia e Internet
31/07/2026                          10/08/2026
180,00                              180,00

                    72
        Importo identico alla rata
        Rata #3 di "Telefonia e Internet"
        Unico match possibile

        [Approva]  [Salta]
```

L'analisi lo definisce **«l'accorgimento più trasferibile dell'intero prodotto»**,
e il motivo è preciso: *«Non il punteggio in sé, che è banale, ma il fatto che
accanto al numero ci siano le frasi che lo giustificano. L'utente non deve
fidarsi di un 72: legge "importo identico, unico match possibile" e decide in un
secondo.»*

## Cosa fare

1. **`src/lib/reconciliation/schedule-matcher.ts`** — cambiare la firma della
   funzione pura da `number` a `{ score: number; reasons: string[] }`. I rami
   esistono già tutti: basta nominarli mentre si sommano.

   | Ramo esistente nel codice | Frase da emettere |
   |---|---|
   | `diff < 0.01` | «Importo identico» |
   | `diff <= 1` | «Importo quasi identico» |
   | `importoEntry < residuo` | «Acconto parziale» |
   | `importoEntry > residuo` | «Importo superiore al residuo» |
   | `giorni === 0` | «Stessa data» |
   | `giorni <= 3` | «Entro tre giorni dalla scadenza» |
   | `giorni <= 10` | «Entro dieci giorni dalla scadenza» |
   | bonus numero documento | «Numero documento nella causale» |
   | similarità descrizione ≥ 0.6 | «Controparte compatibile» |

2. **`findScheduleCandidates` / `findEntryCandidates`** — aggiungere «Unico match
   possibile» quando dopo il filtro su `MINIMUM` resta un solo candidato, e
   «N alternative» quando ne restano più d'uno. Questa non si calcola nella
   funzione pura: dipende dall'insieme.

3. **`src/components/scadenzario/schedule-reconciliation-panel.tsx`** — una fila
   di `<Badge variant="secondary" className="text-[10px]">` sotto il punteggio.

4. **`src/lib/reconciliation/__tests__/schedule-matcher.test.ts`** — estendere i
   test esistenti alle motivazioni. È una funzione pura: costa poco.

## Criteri di accettazione

- [ ] `calculateScheduleMatchScore` restituisce `{ score, reasons }` e il valore
      di `score` è **identico** a prima a parità di input (nessuna regressione sul
      punteggio).
- [ ] I chiamanti esistenti sono aggiornati e la suite passa.
- [ ] Un match con importo esatto e stessa data mostra almeno due motivazioni.
- [ ] Quando esiste un solo candidato sopra soglia, compare «Unico match
      possibile».
- [ ] Quando ce ne sono tre, ciascuno mostra «3 alternative».
- [ ] Le motivazioni sono in italiano e leggibili senza conoscere i pesi.

## File coinvolti

- `src/lib/reconciliation/schedule-matcher.ts`
- `src/lib/reconciliation/__tests__/schedule-matcher.test.ts`
- `src/components/scadenzario/schedule-reconciliation-panel.tsx`
- eventuali altri chiamanti: `grep -rn calculateScheduleMatchScore src`

## Evidenza

- `docs/cashking/02-aree-funzionali/02-01-riconciliazione-assistita.md` §5, §5b, §9
- Screenshot: `assets/cashking/screenshots/09-riconciliazione-proposte-punteggio.png`
