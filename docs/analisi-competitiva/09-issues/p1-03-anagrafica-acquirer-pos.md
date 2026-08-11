# Retail: anagrafica degli acquirer POS con struttura commissionale

`RET-04` · impatto **5** · effort M · prerequisito di `RET-05`

## Contesto

`CashStation.posAmount` registra quanto è stato incassato con carta durante la
chiusura, e **da lì non succede nulla**: non nasce alcun credito verso
l'acquirer, nessuno sa quando quel denaro arriverà in banca né al netto di quali
commissioni.

Per WEISS è la voce di cassa più grande, ed è oggi completamente cieca fra
l'incasso al banco e la riga sull'estratto conto.

## Cosa fa Cash King

Il modulo Retail ha `retailOperators` — «Configurazione operatori e acquirer POS»,
descritti nella guida come *«i servizi che gestiscono i pagamenti con carta nel
tuo negozio (Nexi, SumUp, Axerve, ecc.)»*:

| Campo | Etichetta | Nota |
|---|---|---|
| `name` | Nome Operatore | |
| `settlementPolicy` | Politica di Accredito | giornaliero · settimanale · mensile |
| `feePercentBps` | Commissione Percentuale | in **punti base** |
| `feeFixedCents` | Commissione Fissa per Transazione | in **centesimi** |
| `feeMonthly` | Canone Mensile | |
| `bankAccountId` | Conto di Accredito | |
| `active` | Attivo | |

Due scelte di modellazione da copiare così come sono:

1. **Tre componenti commissionali simultanee** (percentuale + fissa per
   transazione + canone mensile). *«È esattamente come sono fatti i contratti
   degli acquirer reali.»*
2. **Punti base e centesimi, interi.** *«Memorizzare la percentuale in punti base
   e la quota fissa in centesimi evita gli errori di arrotondamento tipici dei
   decimali in virgola mobile su migliaia di micro-transazioni.»*

E il suggerimento della guida che spiega il flag `active`: *«Se cambi operatore
POS, disattiva il vecchio e crea il nuovo: così mantieni lo storico degli
accrediti passati.»*

## Cosa fare

1. **Modello `PosOperator`** in `prisma/schema.prisma`:
   - `venueId`, `name`, `settlementPolicy` (enum: `GIORNALIERO` / `SETTIMANALE` /
     `MENSILE`), `settlementDelayDays` (i giorni fra l'incasso e l'accredito),
     `feePercentBps` (`Int`), `feeFixedCents` (`Int`), `feeMonthly` (`Decimal`),
     `bankAccountId`, `costCenterId`, `isActive`, timestamp.
   - `costCenterId` è l'aggiunta nostra: WEISS ha tre sedi e ciascuna può avere
     il proprio terminale, quindi l'accredito va imputato al centro giusto.
2. **CRUD** in `src/app/api/pos-operators/` seguendo le convenzioni di
   `src/CLAUDE.md`: rotta in italiano, ruoli `admin`/`manager`, `venueScoped`.
3. **Pagina** in `/impostazioni/pos` o dentro `/impostazioni/banche-e-conti`, che
   è dove sta già la configurazione dei conti.
4. **Collegare la chiusura**: `CashStation` deve poter dichiarare **quale
   operatore** ha incassato il `posAmount`. Se una postazione ha un solo terminale
   basta un default sull'anagrafica postazione; se ne ha più d'uno serve il
   *tender split* che Cash King chiama così.

## Criteri di accettazione

- [ ] Si crea un operatore con le tre componenti commissionali e la politica di
      accredito.
- [ ] Percentuale e quota fissa sono **interi** (`feePercentBps`,
      `feeFixedCents`), mai `Float`.
- [ ] Disattivare un operatore non ne cancella lo storico né lo rimuove dagli
      accrediti passati.
- [ ] L'operatore è collegabile a un conto bancario di accredito e a un centro di
      costo.
- [ ] Un test verifica il calcolo del netto: `lordo − (lordo × bps/10000) −
      (transazioni × fissa)`.

## Fuori perimetro

La generazione degli accrediti attesi è `RET-05`
(`p1-04-accrediti-pos-attesi.md`). Questo ticket costruisce solo il modello e la
configurazione — che è la parte che si può fare **subito**, perché i dati non
vengono da un software ma dal **contratto dell'acquirer di WEISS**.

## File coinvolti

- `prisma/schema.prisma` + migrazione
- `src/app/api/pos-operators/`
- `src/app/(dashboard)/impostazioni/` (nuova sezione o estensione di
  `banche-e-conti`)
- `prisma/schema.prisma` → `CashStation` (collegamento all'operatore)

## Evidenza

- `docs/cashking/02-aree-funzionali/02-04-modulo-retail.md` §5, §11
- ⚠️ Fonte documentale, non osservazione: il modulo è bloccato da addon e non è
  stato eseguito. Vedi `docs/analisi-competitiva/06-lacune-di-conoscenza.md` §3.1
