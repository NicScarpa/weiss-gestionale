# Versamenti contanti: registrare il numero di distinta bancaria

`RET-07` · impatto 3 · effort **S** · quick win #13

## Contesto

Il versamento dei contanti in banca è modellato come trasferimento fra registri:
due `JournalEntry` legati da `transferId` (`prisma/schema.prisma:476-487`). Il
modello è corretto — la liquidità totale non cambia, il denaro si sposta da
`CASH` a `BANK` — ma il movimento **non porta il riferimento della distinta**.

Conseguenza pratica: quando la riga compare sull'estratto conto, abbinarla al
nostro versamento si fa a occhio, per data e importo. Due versamenti dello stesso
giorno per la stessa cifra sono indistinguibili — è lo stesso problema che il
commento su `transferId` già segnala per l'appaiamento a posteriori.

## Cosa fa Cash King

Il modulo «Versamenti Contanti» ha un campo `reference`, descritto nella guida
come **«il numero della distinta di versamento bancaria»**.

*«Il campo Riferimento agganciato al numero di distinta è ciò che rende
verificabile l'abbinamento col movimento bancario.»*

## Cosa fare

Nessuna colonna nuova: **`JournalEntry.documentRef` esiste già** e non è
valorizzato sui trasferimenti.

1. **`src/components/prima-nota/movimenti/MovimentoFormDialog.tsx`** — quando
   l'operazione è un versamento (trasferimento con destinazione `BANK`), mostrare
   un campo «Numero distinta», scritto in `documentRef` su **entrambe** le righe
   del trasferimento.
2. **Lista movimenti** — rendere `documentRef` visibile sulla riga del
   trasferimento, non solo nel dettaglio.
3. **Matching bancario** — `calculateMatchScore` in
   `src/lib/reconciliation/matcher.ts:122-129` dà già un bonus del 10% quando
   `documentRef` compare nella descrizione della transazione bancaria: valorizzare
   il campo lo attiva **senza toccare l'algoritmo**. È il punto in cui il quick
   win si ripaga da solo.

## Criteri di accettazione

- [ ] Il campo compare solo sui versamenti verso banca, non su tutti i movimenti.
- [ ] Il valore finisce su entrambe le righe del trasferimento (stesso
      `transferId`).
- [ ] Il campo è facoltativo: un versamento senza distinta si registra come
      prima.
- [ ] La riga di lista mostra il riferimento quando c'è.
- [ ] Un test verifica che il bonus di matching scatti quando il numero di
      distinta compare nella causale bancaria importata.

## File coinvolti

- `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx`
- `src/components/prima-nota/movimenti/MovimentiClient.tsx`
- `src/lib/reconciliation/__tests__/` (test del bonus)

## Evidenza

- `docs/cashking/02-aree-funzionali/02-04-modulo-retail.md` §7
- Bonus già implementato: `src/lib/reconciliation/matcher.ts:122-129`
