# Previsionale: congelare uno snapshot settimanale per poter misurare gli scostamenti

`SCS-01` · impatto 4 · effort M · prerequisito di `SCS-02`

## Contesto

Ogni ricalcolo della previsione sovrascrive il precedente. Non esiste modo di
sapere **cosa il gestionale prevedeva un mese fa**, e quindi non esiste modo di
sapere se ci azzeccava.

È la domanda che rende una previsione uno strumento invece di un'opinione:
*«l'utente deve fidarsi di una previsione senza poter verificare lo storico di
affidabilità di chi gliela fornisce.»*

## Cosa fanno loro

**Agicap** ha *Impostazioni → Analisi degli scostamenti → Bloccare il
previsionale*: **«Bloccare automaticamente ogni settimana i dati previsionali»**,
con giorno della settimana, ora, fuso orario e un campo «Ultimi dati congelati».

*«È il meccanismo con cui il prodotto costruisce lo storico delle previsioni: uno
snapshot settimanale congelato, da confrontare poi con il consuntivo. Senza di
esso l'analisi degli scostamenti non ha un termine di paragone.»*

**Cash King non ce l'ha in tesoreria**, e la verifica è stata fatta per
esclusione su 173 rotte, 279 endpoint e la ricerca della stringa
`forecastSnapshot` nel bundle: zero occorrenze. *«Per un prodotto che vende
previsione di cassa questa è la lacuna più seria trovata.»*

Ce l'ha però **nel modulo Retail**, e fatto bene: l'indicatore «Varianza
Previsione» con soglie **verde ≤5% · giallo ≤15% · rosso >15% = modello da
rivedere**. Il ciclo di autovalutazione — prevedo, confronto, correggo — è
progettato e implementato, ma solo per le vendite del punto vendita.

L'ipotesi che l'analisi avanza sul perché è istruttiva: *«nel Retail la previsione
nasce da un modello esplicito e versionato, mentre in tesoreria è ricalcolata al
volo dalle scadenze e non è mai un oggetto persistente. Senza un oggetto
"previsione" salvato non c'è nulla da confrontare.»*

**È esattamente la nostra situazione.**

## Cosa fare

1. **Modello `ForecastSnapshot`**:
   - `venueId`, `presoIl` (timestamp), `orizzonteGiorni`, `serie` (JSON: la serie
     giornaliera con data, saldo previsto e fonte), `saldoIniziale`,
     `parametri` (JSON: soglia, metodo, pesi usati — così uno snapshot resta
     interpretabile anche se le impostazioni cambiano).
2. **Cron settimanale** — `src/app/api/previsionale/snapshot/cron/route.ts`, sul
   modello dei due cron esistenti. Lunedì mattina, fuso `Europe/Rome`.

   ⚠️ Agicap usa `Europe/Paris` come predefinito **su un account italiano**, che è
   il genere di dettaglio che sbaglia un confronto a cavallo dell'ora legale.
   Noi abbiamo `src/lib/timezone.ts`: usarlo.
3. **Ritenzione** — 52 snapshot (un anno), poi si tiene uno snapshot al mese.
   Definirlo subito: senza politica di ritenzione la tabella cresce e nessuno se
   ne accorge finché non è tardi.
4. **Snapshot a richiesta** — pulsante «Congela la previsione di oggi», utile
   prima di una decisione importante.

## Criteri di accettazione

- [ ] Il cron produce uno snapshot a settimana e non due se eseguito due volte.
- [ ] Lo snapshot contiene i parametri con cui è stato calcolato, non solo il
      risultato.
- [ ] Il fuso orario è `Europe/Rome` via `src/lib/timezone.ts`.
- [ ] La politica di ritenzione è implementata e testata.
- [ ] Uno snapshot resta leggibile dopo un cambio delle impostazioni di
      previsione.
- [ ] Il cron è registrato su Railway come gli altri due.

## Fuori perimetro

Il **confronto** previsto/consuntivo è `SCS-02`, ticket separato. Questo produce
solo il dato: senza, `SCS-02` non ha niente da confrontare.

Va però deciso qui il **formato della serie**, perché è quello che `SCS-02`
leggerà. Consiglio: la stessa forma restituita dalla funzione di proiezione unica
di `PRV-03` (`p1-01`), così i due lati parlano la stessa lingua. **Fare `PRV-03`
prima di questo.**

## File coinvolti

- `prisma/schema.prisma` + migrazione
- `src/app/api/previsionale/snapshot/cron/route.ts` (nuovo)
- `src/lib/previsionale/` (la funzione di proiezione di `PRV-03`)
- `src/lib/timezone.ts` (uso)

## Evidenza

- `docs/agicap/04b-comportamenti-nel-tempo.md` §Predisposizioni attive
- `docs/cashking/04b-comportamenti-nel-tempo.md` §5b
- Cron esistenti: `src/app/api/promemoria-timbratura/cron/route.ts`,
  `src/app/api/saldi/riporto-anno/cron/route.ts`
