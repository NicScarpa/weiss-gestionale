# Scadenzario: avvisare prima che una scadenza arrivi

`ALR-03` · impatto **5** · effort M

## Contesto

`ScheduleReminder` è **schema morto**. Il modello esiste con `giorniPrima`,
`tipo` (`email` / `in_app` / `entrambi`), `messaggio`, `inviato`, `dataInvio`
(`prisma/schema.prisma:744-758`), e **non ha alcun consumer runtime**: l'unico
riferimento in tutto `src/` è il tipo TypeScript
(`src/types/schedule.ts:153`). Nessun valore di `NotificationType` copre le
scadenze.

L'unico segnale esistente è il badge rosso sulla voce di menu Scadenzario, che
conta le scadute — cioè avvisa **dopo**, e solo se si è già dentro
l'applicazione.

**L'infrastruttura c'è tutta e non è collegata al modulo che ne ha più bisogno**:

| Pezzo | Stato |
|---|---|
| Push VAPID | attive dal 7 agosto 2026 |
| `PushSubscription`, service worker | in produzione |
| `NotificationLog`, `NotificationPreference` | in produzione |
| Invio email | `src/lib/email.ts` |
| Cron su Railway | due già configurati (`promemoria-timbratura/cron`, `saldi/riporto-anno/cron`) |

Tutto questo serve oggi solo il personale e le presenze.

## Cosa fanno loro

Nessuno dei tre lo ha mostrato, ed è una convergenza `0/3` — ma il valore per
WEISS non dipende da loro:

- **Cash King** lo vende come addon a **2,99 €/mese**, con modelli di messaggio,
  coda di invio, registro degli inviati e scheduler. Che lo vendano separatamente
  è il segnale che il mercato lo paga. L'addon non era attivo, quindi *«l'intero
  capitolo alert e notifiche via email del metodo non è osservabile»*.
- **Agicap** non è osservabile senza scrivere in produzione.
- **Trezy** ha solo l'avviso di saldo sotto soglia, via email — e da telefono la
  pagina che lo configura **non è raggiungibile**, il che è il difetto da non
  ripetere.

## Cosa fare

1. **`NotificationType`** — aggiungere `SCADENZA_IN_AVVICINAMENTO` e
   `SCADENZA_SCADUTA`.
2. **Cron giornaliero** — `src/app/api/scadenzario/promemoria/cron/route.ts`,
   sul modello di `src/app/api/promemoria-timbratura/cron/route.ts`, che:
   - legge i `ScheduleReminder` con `inviato: false` la cui scadenza cade fra
     `giorniPrima` giorni;
   - invia push ed email secondo `tipo` e le `NotificationPreference` dell'utente;
   - scrive `NotificationLog`, marca `inviato` e `dataInvio`.
3. **Promemoria di default** — alla creazione di una scadenza, generare un
   `ScheduleReminder` a 3 giorni per le passive con `priorita` alta o urgente. Il
   modello lo consente e nessuno lo popola; senza un default il meccanismo resta
   inutilizzato come oggi.
4. **UI** — sezione «Promemoria» nel dettaglio scadenza per aggiungerne,
   modificarne, rimuoverne.
5. **Registrare il cron su Railway**, come gli altri due.

## Criteri di accettazione

- [ ] Una scadenza passiva a 3 giorni con promemoria attivo genera una push e una
      voce in `NotificationLog`.
- [ ] Il promemoria **non** viene inviato due volte (`inviato` è la guardia).
- [ ] Una scadenza già pagata non genera promemoria, anche se la data si avvicina.
- [ ] Le preferenze dell'utente sono rispettate: chi ha disattivato le push non
      le riceve.
- [ ] Il cron è idempotente: due esecuzioni nello stesso giorno non duplicano.
- [ ] Il messaggio contiene descrizione, importo, data e un collegamento diretto
      alla scadenza.

## Nota

Se il meccanismo si rivelasse rumoroso, la leva è `giorniPrima` per scadenza, non
un interruttore globale: un F24 va annunciato con una settimana, una fattura da
200 € il giorno prima o mai.

## File coinvolti

- `prisma/schema.prisma` (enum `NotificationType`, migrazione)
- `src/app/api/scadenzario/promemoria/cron/route.ts` (nuovo)
- `src/lib/notifications/`
- `src/app/api/scadenzario/route.ts` (promemoria di default alla creazione)
- `src/app/(dashboard)/scadenzario/[id]/page.tsx`

## Evidenza

- Schema morto: `prisma/schema.prisma:744-758` contro
  `grep -rn scheduleReminder src` → un solo risultato, in `src/types/schedule.ts`
- `docs/cashking/04b-comportamenti-nel-tempo.md` §6
- Modello di cron esistente: `src/app/api/promemoria-timbratura/cron/route.ts`
