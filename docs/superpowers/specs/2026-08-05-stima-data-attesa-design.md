# Stima preventiva della data attesa di cassa

**Data:** 5 agosto 2026
**Stato:** approvata
**Contesto:** completamento naturale della fase 3 del ciclo tesoreria
(`docs/Ciclo_Tesoreria_Modello_Sibill.md`). Oggi `Schedule.dataAttesa` diverge
dalla data contrattuale solo *alla* riconciliazione, cioè a giochi fatti: il
previsionale continua a promettere le date contrattuali. Questa feature fa
divergere la data attesa *prima*, proiettando sulle scadenze aperte il ritardo
storico di pagamento del fornitore.

## Obiettivo

Se un fornitore viene pagato sistematicamente con N giorni di ritardo (o di
anticipo), le sue scadenze aperte mostrano una data attesa di cassa spostata di
N giorni, e saldo scalare, aging e summary — che già leggono
`dataAttesa ?? dataScadenza` — riflettono quando i soldi si muovono davvero.

## Non-obiettivi

- **Scadenze attive** (clienti da incassare): fuori ambito, si aggiungono se
  serviranno. La stima riguarda solo le passive con `supplierId`.
- **Esposizione in lista**: la data attesa si vede e si modifica solo nel
  dettaglio scadenza. La lista non cambia.
- **Batch/cron**: nessun ricalcolo schedulato; il ricalcolo avviene sugli
  eventi che cambiano la storia (vedi sotto).
- **Conferma esplicita**: la stima è automatica e silenziosa, non una proposta
  da accettare.

## Modello dati

Un solo campo nuovo, additivo (push sicuro sul database condiviso con la
produzione, come per `dataAttesa` e `verificata`):

```prisma
/// Provenienza di dataAttesa: 'stima' (ritardo storico del fornitore),
/// 'manuale' (impostata dall'utente), 'riconciliazione' (riallineata alla
/// data del movimento che ha saldato). Null se e solo se dataAttesa è null.
dataAttesaSource String? @map("data_attesa_source")
```

**Invariante:** `dataAttesa` e `dataAttesaSource` sono entrambe null o entrambe
valorizzate. Null continua a significare "coincide con la contrattuale".

**Gerarchia delle fonti:** `riconciliazione` > `manuale` > `stima`.
Il dato reale del movimento sovrascrive tutto; la mano dell'utente vince sulla
stima; la stima non sovrascrive mai le altre due.

## Calcolo del ritardo tipico

Modulo `src/lib/scadenzario/stima-data-attesa.ts`.

- **Popolazione:** scadenze passive del fornitore con `stato = 'pagata'`,
  `dataPagamento` non null, pagate negli ultimi 12 mesi
  (`dataPagamento >= oggi − 365 giorni`), non annullate.
- **Ritardo per scadenza:** `dataPagamento − dataScadenza` in giorni interi.
  Negativo se il fornitore viene pagato in anticipo: la stima si applica lo
  stesso, anticipando la data attesa.
- **Stima:** la **mediana** dei ritardi (robusta agli anomali: la fattura
  contestata pagata a 90 giorni non sposta la stima), arrotondata al giorno.
- **Soglie di applicabilità:** campione ≥ 3 osservazioni e |mediana| ≥ 2
  giorni. Sotto una delle due soglie la stima non si applica (troppo rumore:
  meglio la data contrattuale).

Tre funzioni:

1. `calcolaRitardoTipico(ritardiGiorni: number[]): number | null` — pura,
   incapsula mediana e soglie. Testabile senza database.
2. `stimaDataAttesaFornitore(supplierId, venueId)` — legge la storia dal
   database e restituisce il ritardo tipico (o null).
3. `applicaStimaDataAttesa` — applica o ricalcola la stima e scrive
   `dataAttesa = dataScadenza + ritardo`, `dataAttesaSource = 'stima'`; se il
   ritardo non è stimabile e la scadenza aveva source `stima`, riporta entrambe
   a null. Non tocca mai source `manuale` o `riconciliazione`. Due modi di
   invocazione: su una singola scadenza (alla creazione, alla modifica di
   `dataScadenza`, dopo l'undo) o su tutte le scadenze aperte di un fornitore
   (quando una sua scadenza diventa pagata).

## Trigger

| Evento | Effetto |
|---|---|
| Creazione scadenza passiva con fornitore (POST /api/scadenzario, import fatture, generazione ricorrenze e genera-prossima) | Applica la stima alla nuova scadenza. Senza storia sufficiente resta null. |
| Una scadenza passiva del fornitore diventa `pagata` (riconciliazione **o** pagamento manuale) | La storia è cambiata: ricalcola la stima su tutte le scadenze aperte del fornitore con source null o `stima`. |
| Modifica di `dataScadenza` su scadenza con source null o `stima` (PATCH) | Riapplica la stima sulla nuova data contrattuale. |
| Riconciliazione che salda la scadenza | `dataAttesa = data movimento`, source `riconciliazione` (comportamento fase 3, ora con provenienza). Sovrascrive anche il manuale. |
| Annullamento della riconciliazione (undo) | Riapplica la stima da zero (risultato: stima o null). Non torna più secco a null. |
| Modifica manuale di `dataAttesa` (PATCH) | source `manuale`; da lì in poi la stima non la tocca. |
| Svuotamento manuale di `dataAttesa` (PATCH con null esplicito) | Torna alla stima automatica: ricalcolo immediato (stima o null). |

**Robustezza:** ogni ricalcolo innescato da un altro flusso (riconciliazione,
pagamento) è best-effort — try/catch con log, come
`applicaRegolaCreaMovimento`. Un'automazione rotta non blocca mai la
registrazione di un pagamento o una riconciliazione.

## API

- `PATCH /api/scadenzario/[id]`: `updateScheduleSchema` accetta `dataAttesa`
  (data oppure null esplicito). Sulle scadenze attive il campo viene rifiutato
  con 400: la data attesa manuale è fuori ambito per le attive, coerentemente
  con la stima. La route imposta la source secondo le regole sopra.
  L'omissione del campo non tocca nulla.
- Nessuna route nuova: il ricalcolo vive nei service/route esistenti.
- `GET /api/scadenzario/[id]` espone già `dataAttesa`; ora espone anche
  `dataAttesaSource`.

## UI (solo dettaglio scadenza)

Nella tab **Informazioni** una riga "Data attesa" con la data e l'origine in
chiaro:

- source `stima` → "stimata: il fornitore paga in media con N giorni di
  ritardo" (o "di anticipo");
- source `manuale` → "impostata manualmente";
- source `riconciliazione` → "riallineata al pagamento";
- null → "coincide con la scadenza".

La modifica passa dallo sheet di modifica esistente, con il campo "Data attesa
di pagamento" visibile solo per le scadenze passive. Svuotare il campo torna
alla stima automatica (il form lo dice nella nota sotto il campo).

## Casi limite

- Fornitore senza storia o sotto soglia → nessuna stima, dataAttesa resta null.
- Scadenze pagate o annullate → mai toccate dal ricalcolo.
- Scadenza passiva senza `supplierId` → nessuna stima (la controparte testuale
  non è affidabile come chiave).
- Ritardo mediano negativo → data attesa anticipata rispetto alla contrattuale.
- Migrazione dati: nessuna. Le scadenze esistenti con `dataAttesa` valorizzata
  dalla fase 3 (riallineate alla riconciliazione) ricevono
  `dataAttesaSource = 'riconciliazione'` via backfill SQL una tantum
  (`UPDATE ... SET data_attesa_source = 'riconciliazione' WHERE data_attesa IS
  NOT NULL AND data_attesa_source IS NULL`), per rispettare l'invariante.

## Test (TDD)

- **Unit puri** su `calcolaRitardoTipico`: mediana pari/dispari, campione < 3,
  |mediana| < 2, ritardi negativi, anomali che non spostano la mediana.
- **Service**: applicazione alla creazione; ricalcolo al saldo che aggiorna le
  aperte con source stima e non tocca manuale/riconciliazione; undo che
  ristima; svuotamento che ristima; modifica dataScadenza che ristima.
- **Route**: PATCH con `dataAttesa` → source `manuale`; PATCH con null →
  ricalcolo; il campo omesso non tocca nulla.
- **Invariante** verificata nei test del service: mai una delle due colonne
  valorizzata senza l'altra.
