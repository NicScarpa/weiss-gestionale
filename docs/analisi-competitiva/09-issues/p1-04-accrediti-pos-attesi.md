# Retail: calcolare l'accredito POS atteso e rilevarne le eccezioni

`RET-05` + `RET-06` · impatto **5** · effort L · dipende da `RET-04`

## Contesto

Fra l'incasso con carta al banco e la riga di accredito sull'estratto conto oggi
non c'è niente. Nessuno sa se l'acquirer ha accreditato la cifra giusta, il giorno
giusto, con le commissioni pattuite — e non c'è modo di accorgersene se non
sommando a mano gli scontrini.

Per un bar che incassa la maggior parte del fatturato con carta è la voce di cassa
più grande e la meno controllata.

## Cosa fa Cash King

**«Accrediti Attesi» — «Tracciamento degli accrediti POS attesi sul conto
corrente»**, descritto nella guida come *«la lista dei soldi che i tuoi operatori
POS devono accreditarti in banca. Come un elenco di assegni in attesa di essere
incassati.»*

Il sistema **genera automaticamente** gli accrediti attesi a partire dagli incassi
giornalieri e dalla configurazione degli operatori. Colonne: Data Prevista ·
Operatore · **Periodo Coperto** · Lordo · Commissioni · **Netto Atteso** · Stato.

Azioni: Genera Accrediti · **Segna come Contabilizzato** · **Segna Eccezione**.

**Sei motivi di eccezione**, enumerati: **Mancante · Importo diverso · Data
diversa · Duplicato · Commissione cambiata · Parziale**.

Perché conta, con le parole dell'analisi: *«È il cuore del modulo. Il problema che
risolve è concreto e fastidioso: l'acquirer accredita in ritardo, o al netto di
commissioni diverse da quelle pattuite, o accorpa più giornate. Senza un atteso
calcolato non te ne accorgi. Con un atteso calcolato, la differenza salta fuori da
sola.»*

E il suggerimento della guida, che va oltre la contabilità: *«Usa le eccezioni per
segnalare accrediti con importo diverso dal previsto: ti aiuterà a **negoziare le
commissioni** con l'operatore.»* La funzione produce le prove per rinegoziare il
contratto.

## Cosa fare

1. **Modello `PosSettlement`**:
   - `posOperatorId`, `dataPrevista`, `periodoDal` / `periodoAl` (il «periodo
     coperto»), `lordo`, `commissioniStimate`, `nettoAtteso`, `stato`
     (`ATTESO` / `CONTABILIZZATO` / `ECCEZIONE`), `motivoEccezione` (enum a sei
     valori), `journalEntryId` opzionale (il movimento che l'ha saldato),
     `costCenterId`.
2. **Job di generazione** — da `CashStation.posAmount` delle chiusure
   **validate** e dalla `settlementPolicy` dell'operatore. Da eseguire come cron
   o all'atto della validazione della chiusura.
3. **Pagina** `/retail/accrediti` (o dentro prima nota, da decidere) con lo stato
   e le azioni.
4. **Enum delle eccezioni** in Prisma, con i sei valori di Cash King.
5. **Riconciliazione** verso il movimento bancario: l'accredito atteso è un
   candidato per il matcher esistente, con il netto atteso come importo. È la
   base di `RET-08`.

## Il caso che dobbiamo decidere da soli

⚠️ **Lacuna nota**: il modulo di Cash King non è stato eseguito (bloccato da
addon), quindi **non sappiamo** come si comporta sul caso più frequente della
realtà — l'acquirer che **accorpa più giornate in un accredito solo**. Né sappiamo
se l'atteso si ricalcola quando la chiusura viene corretta dopo la generazione.

Due decisioni da prendere prima di scrivere il codice:

- **Accorpamento**: un `PosSettlement` copre un intervallo (`periodoDal` /
  `periodoAl`), non un giorno. La `settlementPolicy` determina l'ampiezza
  dell'intervallo. Un accredito settimanale copre sette giornate di incasso e ne
  somma i lordi.
- **Ricalcolo**: se una chiusura già inclusa in un accredito `ATTESO` viene
  corretta, l'accredito si rigenera; se è già `CONTABILIZZATO`, no — si segnala
  invece un'eccezione «importo diverso».

**Prima di implementare, leggere il contratto dell'acquirer di WEISS.** È la fonte
migliore e costa meno di una trattativa commerciale con Cash King — vedi
`06-lacune-di-conoscenza.md` §5.1.

## Criteri di accettazione

- [ ] Validando una chiusura con `posAmount` valorizzato nasce (o si aggiorna) un
      `PosSettlement` atteso.
- [ ] Il netto atteso è `lordo − (lordo × feePercentBps/10000) − (n. transazioni ×
      feeFixedCents/100)`, con un test che lo verifica in centesimi interi.
- [ ] Una politica settimanale produce **un** accredito che copre sette giornate,
      non sette accrediti.
- [ ] Le sei eccezioni sono selezionabili e la scelta è registrata con l'autore.
- [ ] Un accredito contabilizzato è collegato al `JournalEntry` che lo ha saldato.
- [ ] Lo scarto fra atteso ed effettivo è mostrato in euro **e** in percentuale.
- [ ] Un report elenca le eccezioni per operatore su un periodo, utilizzabile in
      trattativa.

## File coinvolti

- `prisma/schema.prisma` + migrazione
- `src/lib/retail/settlements.ts` (nuovo, con il calcolo puro e testabile)
- `src/app/api/retail/accrediti/`
- `src/app/(dashboard)/retail/accrediti/`
- `src/lib/closure-service.ts` (aggancio alla validazione)

## Evidenza

- `docs/cashking/02-aree-funzionali/02-04-modulo-retail.md` §6, §11
- ⚠️ Fonte documentale (guida in-app estratta dal bundle), non osservazione
