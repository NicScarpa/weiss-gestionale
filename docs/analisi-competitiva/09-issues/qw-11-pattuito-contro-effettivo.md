# Fornitori: mostrare il ritardo effettivo confrontato con i termini pattuiti

`SCD-14` · impatto 3 · effort **S** · quick win #11

✅ **Chiuso nell'Onda 1** (commits `aafa40c` + `7d7687b`, 11-12 agosto 2026).

## Contesto

Abbiamo già i due ingredienti e non li mettiamo mai insieme:

- `Supplier.paymentTermsDays` — i giorni di dilazione concordati
  (`prisma/schema.prisma:556-559`);
- la **mediana dei ritardi del fornitore negli ultimi 12 mesi**, che
  `src/lib/scadenzario/stima-data-attesa.ts` calcola già per proiettare
  `dataAttesa` — ma resta interna alla stima e non si vede da nessuna parte.

Il risultato è che il gestionale *sa* che un fornitore paga sistematicamente con
dodici giorni di ritardo, lo usa per correggere il previsionale, e non lo dice
mai a chi deve trattare con quel fornitore.

## Cosa fa Cash King

Il report DSO/DPO affianca, per ogni soggetto: **Termini di pagamento** · **Giorni
termini** · giorni effettivi · **Differenza** · **Stato**, con legenda dichiarata:
**Migliore** se paga prima dei termini, **Peggiore** se dopo, **In linea** entro
±2 giorni.

Il caso che mostra perché conta: *Innovation Labs Inc*, termini «Bonifico
Anticipato −7 gg», DSO effettivo 4 giorni, differenza **+11**, stato
**Peggiore**. *«Un cliente che paga in quattro giorni sembrerebbe ottimo in
assoluto; misurato contro l'impegno di pagare sette giorni prima della fattura, è
in ritardo di undici. È esattamente il ribaltamento di giudizio che un DSO nudo
non produce mai.»*

## Cosa fare

1. **`src/lib/scadenzario/stima-data-attesa.ts`** — esporre la mediana già
   calcolata come funzione pubblica (es. `ritardoMedianoFornitore(supplierId)`),
   insieme alla numerosità del campione. Oggi il calcolo esiste ma è privato al
   percorso della stima.
2. **Scheda fornitore** (`src/app/(dashboard)/anagrafiche/fornitori/`) — tre
   celle:
   - *Pattuito*: `paymentTermsDays` (o «non impostato»);
   - *Effettivo*: mediana dei ritardi, con la numerosità fra parentesi;
   - *Differenza*: con badge **In linea** (±2 giorni) / **In ritardo** / **In
     anticipo**.
3. Quando il campione è sotto la soglia di applicabilità già definita nella spec
   (3 osservazioni), scrivere **«dati insufficienti»**, non un trattino: la
   colonna deve distinguere «non calcolabile» da «zero».

L'ultimo punto è il correttivo a un difetto osservato in Trezy, dove «Tempo medio
di pagamento» e «Ritardo medio» mostrano `--` su ogni riga e *«l'interfaccia non
distingue non calcolabile da zero e non dice all'utente che cosa dovrebbe fare
per popolarle»*.

## Criteri di accettazione

- [ ] Un fornitore con ≥3 scadenze saldate mostra la mediana dei ritardi e la
      numerosità.
- [ ] Un fornitore con meno di 3 mostra «dati insufficienti», non `--`.
- [ ] Con `paymentTermsDays` valorizzato compare la differenza e il badge.
- [ ] Il badge «In linea» copre ±2 giorni, come Cash King.
- [ ] La mediana mostrata coincide con quella usata per stimare `dataAttesa`
      (stessa funzione, non una seconda implementazione).

## File coinvolti

- `src/lib/scadenzario/stima-data-attesa.ts`
- `src/app/(dashboard)/anagrafiche/fornitori/` (componente lista o scheda)
- `src/app/api/suppliers/route.ts` (se serve arricchire la risposta)

## Evidenza

- `docs/cashking/02-aree-funzionali/02-03-scadenzario.md` §3b
- Screenshot: `assets/cashking/screenshots/18-report-dso-dpo-pesato-e-puro.png`
- Difetto da evitare: `docs/trezy/02-aree-funzionali/02-02-documenti-scadenzario-riconciliazione.md` §13.13
