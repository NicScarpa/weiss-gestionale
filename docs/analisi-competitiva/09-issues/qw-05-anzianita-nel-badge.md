# Scadenzario: l'anzianità del ritardo dentro il badge di stato

`SCD-04` · impatto 4 · effort **S** · quick win #5

✅ **Chiuso nell'Onda 1** (commits `a44a69f..f15a48e`, 11-12 agosto 2026).

## Contesto

`ScheduleStatusBadge` mostra «Scaduta». **Quanto** scaduta si scopre solo aprendo
`/scadenzario/aging`, che è un'altra pagina con un'altra vista. Nella lista, una
fattura in ritardo di tre giorni e una in ritardo di sette mesi sono
indistinguibili.

## Cosa fa Trezy

La cella STATO non contiene solo l'etichetta: contiene **l'età del ritardo**.
Le righe mostrano «Scaduto +117g», «Scaduto +6g», «Scaduto +11g».

*«In uno scadenzario tradizionale l'anzianità di un credito si legge o in una
colonna dedicata o cambiando vista; qui il badge di stato porta con sé la
gravità, e la lista diventa scorribile per urgenza senza ordinarla. Il costo
cognitivo è nullo: l'utente legge "Scaduto" e, nello stesso colpo d'occhio,
quanto.»*

## Cosa fare

1. **`src/components/scadenzario/schedule-status-badge.tsx`** — prop opzionale
   `giorniRitardo?: number`. Quando presente e > 0, il testo diventa
   `Scaduta +117g`.
2. Il chiamante nella lista scadenzario calcola i giorni da
   `dataAttesa ?? dataScadenza` rispetto a oggi.
3. Intensità del colore proporzionale, sfruttando le fasce di aging che già
   esistono: fino a 30 giorni il rosso attuale, oltre i 90 più carico. Non serve
   una scala nuova — `FASCE` in `src/app/api/scadenzario/aging/route.ts` la
   definisce già.

## Criteri di accettazione

- [ ] Una scadenza scaduta da 6 giorni mostra `+6g`; una da 117 mostra `+117g`.
- [ ] Una scadenza non scaduta mostra il badge invariato, senza suffisso.
- [ ] Il calcolo usa `dataAttesa ?? dataScadenza`, coerente con `aging` e
      `saldo-scalare`.
- [ ] Il badge resta leggibile in `showLabel={false}` (la variante a pallino non
      cambia).
- [ ] Nessuna nuova chiamata di rete: il dato è già nella risposta della lista.

## Nota sul caso limite

Trezy mostra un «+1247g» — una fattura di utenze scaduta da tre anni e quattro
mesi, che *«va marcato come dato storico anomalo, non come scaduto operativo»*.
Il loro problema nasce dalla fascia «90+» aperta senza fondo, che mescola il
ritardo di quattro mesi con il rumore d'archivio. **Da noi non si pone**:
l'aging ha già `90-120 gg` e `>120 gg` come fasce distinte.

## File coinvolti

- `src/components/scadenzario/schedule-status-badge.tsx`
- `src/app/(dashboard)/scadenzario/page.tsx` (passaggio della prop)

## Evidenza

- `docs/trezy/02-aree-funzionali/02-02-documenti-scadenzario-riconciliazione.md` §5
- Gli screenshot Trezy sono fuori dal versionamento (`.gitignore:48`): il
  documento riporta le righe testualmente.
