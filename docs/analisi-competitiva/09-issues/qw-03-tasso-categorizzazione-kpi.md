# Prima nota: barra del tasso di categorizzazione con obiettivo dichiarato

`CLS-16` · impatto 4 · effort **S** · quick win #3

## Contesto

Non esiste alcun indicatore di quanti movimenti siano privi di imputazione
contabile. Il dato c'è (`JournalEntry.accountId` nullo) e nessuna schermata lo
espone: la manutenzione della prima nota è un lavoro invisibile, quindi
rimandabile all'infinito.

Abbiamo già il suggeritore di regole
(`GET /api/categorization-rules/proposals` + `CategorizationProposalsDialog`),
cioè la strada per abbassare quel numero. Manca il numero.

## Cosa fa Agicap

In cima alla lista dei movimenti bancari, una barra di progresso:

> **0%** — Transazioni bancarie categorizzate negli ultimi 15 giorni. Raggiungere
> fino al 95% con il creatore di regole di categorizzazione.

Accanto, un pulsante con pallino rosso: «Rivedere le regole di categorizzazione
suggerite». Sulla voce di menu, il badge «228 transazioni da categorizzare negli
ultimi 60 giorni».

*«Trasforma la manutenzione dei dati — attività noiosa e rimandabile — in un
progresso misurabile con un traguardo. È un accorgimento a costo quasi nullo e
alto rendimento.»*

## Cosa fare

1. **Backend** — conteggio dei `JournalEntry` con `accountId: null` e
   `hiddenAt: null` sugli ultimi 60 giorni, sul totale dello stesso periodo.
   Aggiungerlo alla risposta di `src/app/api/prima-nota/route.ts`, oppure una
   rotta `/api/prima-nota/summary` se la prima è già affollata.
2. **`src/components/prima-nota/movimenti/MovimentiClient.tsx`** — componente
   `Progress` di shadcn sopra la tabella:
   - percentuale categorizzata sugli ultimi 60 giorni;
   - obiettivo 95% come costante, indicato nel testo;
   - pulsante «Rivedi le regole suggerite» che apre
     `CategorizationProposalsDialog`, **che esiste già**.
3. La barra sparisce quando la percentuale è ≥95%: sopra l'obiettivo non è più
   un invito, è rumore.

## Criteri di accettazione

- [ ] La percentuale è calcolata su una finestra mobile di 60 giorni, non su
      tutta la storia.
- [ ] I movimenti nascosti (`hiddenAt`) e cancellati non entrano nel
      denominatore.
- [ ] Il pulsante apre il dialog delle proposte e, chiudendolo dopo aver
      applicato una regola, la percentuale si aggiorna.
- [ ] Con percentuale ≥95% la barra non compare.
- [ ] Il testo dichiara l'obiettivo, non solo lo stato.

## Da non copiare

Il contatore «249 da verificare» di Trezy vale per tutti i documenti
indistintamente e **quindi non ordina nulla**: l'utente non sa da quale
cominciare. Il numero deve avere accanto la strada per abbassarlo — che da noi è
già costruita.

## File coinvolti

- `src/app/api/prima-nota/route.ts`
- `src/components/prima-nota/movimenti/MovimentiClient.tsx`
- `src/components/prima-nota/regole/CategorizationProposalsDialog.tsx` (solo
  invocazione, nessuna modifica)

## Evidenza

- `docs/agicap/02-aree-funzionali/02-01-categorizzazione-e-regole.md` §1
- Difetto da evitare: `docs/trezy/02-aree-funzionali/02-02-documenti-scadenzario-riconciliazione.md` §8.1
