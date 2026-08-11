# Scadenzario: segnalare le scadenze pagate senza alcun movimento di prima nota

`SCD-08` · impatto **5** · effort **S** · quick win #1

## Contesto

`POST /api/scadenzario/[id]/pagamenti` crea un `SchedulePayment`, aggiorna
`importoPagato` e ricalcola lo stato della scadenza — e **non genera alcun
`JournalEntry`** (verificato: nessun `journalEntry.create` nella transazione,
`src/app/api/scadenzario/[id]/pagamenti/route.ts:92-145`).

È un percorso legittimo: serve per i pagamenti che non transitano da un estratto
conto. Ma la conseguenza è silenziosa e grave:

1. la scadenza esce dal previsionale, perché il saldo scalare somma il **residuo**
   e il residuo è andato a zero;
2. il denaro **non compare mai nel consuntivo**, perché in prima nota non è
   successo niente;
3. il saldo di cassa non scende.

Nessuna delle due schermate sbaglia da sola. Insieme raccontano due storie
diverse, e non c'è modo di distinguere «pagata in contanti e registrata altrove»
da «qualcuno ha spuntato pagata per sbaglio».

La stessa classe di errore è documentata su Cash King, dove vale **15 fatture per
57.545 €** sul dataset dimostrativo.

## Cosa fa Cash King

Riquadro **«Saldate fuori sistema»** in cima allo scadenzario, con contatore
cliccabile e questo testo:

> Fatture marcate come pagate ma senza alcun movimento collegato (banca, carta,
> gateway, compensazione, ritenuta, nota di credito o differenza cambio). Non
> incidono sul cashflow: probabilmente saldate in cassa, con nota spese o con
> compensazione manuale.

Il dettaglio che fa la differenza è l'ultima frase: **spiega perché può essere
legittimo** invece di presentare le righe come errori.

## Cosa fare

1. **`src/app/api/scadenzario/summary/route.ts`** — aggiungere due campi alla
   risposta:
   - `pagateSenzaMovimento`: conteggio delle `Schedule` con `importoPagato > 0`
     **e** `reconciliations: { none: { status: 'VERIFIED' } }`;
   - `pagateSenzaMovimentoImporto`: somma di `importoPagato` sulle stesse.
2. **`src/types/schedule.ts`** — estendere `ScheduleSummary`.
3. **`src/components/scadenzario/schedule-summary-cards.tsx`** — quinta card,
   con il testo esplicativo che dichiara le cause legittime. Cliccabile.
4. **`src/app/(dashboard)/scadenzario/page.tsx`** — accettare un filtro
   `pagateSenzaMovimento=true` e applicarlo alla lista.
5. **`src/app/api/scadenzario/route.ts`** — supportare il filtro.

## Criteri di accettazione

- [ ] Una scadenza saldata con `POST .../pagamenti` e senza riconciliazione
      compare nel contatore.
- [ ] Una scadenza saldata tramite riconciliazione con un `JournalEntry` **non**
      compare.
- [ ] Una scadenza con pagamento parziale e nessuna riconciliazione compare
      (l'importo esposto è quello pagato, non il totale).
- [ ] Il click sulla card filtra la lista sottostante.
- [ ] La card mostra il testo che dichiara le cause legittime, non un messaggio
      di errore.
- [ ] Il contatore è a zero su un database di test in cui ogni pagamento è
      riconciliato.

## Fuori perimetro

**Non** aggiungere un'azione correttiva in blocco. Su Cash King il pulsante
«Correggi Tutte» tocca quindici documenti in un clic **senza lasciare traccia**
(il flag `isEdited` resta `false` dopo la correzione, verificato), il che rende
l'operazione irreversibile e invisibile a posteriori. Se in futuro servirà
un'azione, deve passare da `createAuditLog`.

## File coinvolti

- `src/app/api/scadenzario/summary/route.ts`
- `src/app/api/scadenzario/route.ts`
- `src/types/schedule.ts`
- `src/components/scadenzario/schedule-summary-cards.tsx`
- `src/app/(dashboard)/scadenzario/page.tsx`

## Evidenza

- Difetto nostro: `src/app/api/scadenzario/[id]/pagamenti/route.ts:92-145`
- Riferimento: `docs/cashking/02-aree-funzionali/02-03-scadenzario.md` §3
- Report equivalente: `docs/cashking/02-aree-funzionali/02-06-stampe-import-pianificazione.md` §1.1
- Screenshot: `assets/cashking/screenshots/05-scadenziario-completo.png`,
  `assets/cashking/screenshots/12-report-incongruenze-fatture.png`
