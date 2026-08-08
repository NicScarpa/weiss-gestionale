# Migrazioni

Dall'8 agosto 2026 lo schema del database ha un **registro versionato**. Prima
non ce l'aveva: ogni modifica veniva applicata con `prisma db push`, che
sincronizza e non lascia storia. In produzione la tabella `_prisma_migrations`
non esisteva affatto.

> ## La regola, in due righe
>
> **In produzione: mai più `prisma db push`. Solo `npm run db:migrate:deploy`.**
> **Ogni modifica allo schema nasce come `npm run db:migrate -- --name <nome>`
> e viaggia in git insieme al codice che la usa.**

Serve perché più di una persona modifica lo stesso schema di produzione. Senza
un registro condiviso, nessuno sa cosa è stato applicato e quando — e un
`db push` fatto da una sessione disallinea il lavoro di tutte le altre.

---

## Cosa c'è qui dentro

| | |
|---|---|
| `0_baseline/migration.sql` | fotografia dello schema di produzione all'8 agosto 2026, 2.655 righe: 79 tabelle, 235 indici, 156 chiavi esterne, 252 valori di enum |

**`0_baseline` è già dichiarata applicata in produzione** (con
`prisma migrate resolve --applied`, che registra e non esegue). Non va mai
eseguita contro il database vero: ricreerebbe da zero uno schema che c'è già.

Serve a due cose: dare un punto di partenza al registro, e permettere di
ricostruire l'intero schema in un ambiente vuoto — staging, un locale, un
ripristino — con un solo `migrate deploy`.

### Che fedeltà ha

Verificata per esecuzione, applicandola a un PostgreSQL vuoto e confrontando
oggetto per oggetto con la produzione:

| | |
|---|---|
| 235 indici | identici |
| 1.081 colonne (tipo, nullabilità, default) | identiche |
| 235 vincoli (156 chiavi esterne, 79 chiavi primarie) | identici |
| 252 valori di enum | identici |
| **59 policy RLS** | **assenti dalla baseline** — vedi `prisma/sql/README.md` |

---

## Il lavoro di tutti i giorni

```bash
source ~/.nvm/nvm.sh && nvm use 22    # il Node di sistema fa fallire npm

# 1. Modifica prisma/schema.prisma
# 2. Genera la migrazione (contro il DB LOCALE: il guard blocca la produzione)
npm run db:migrate -- --name aggiunge_centro_di_costo
# 3. Committa insieme: schema.prisma + prisma/migrations/<data>_<nome>/
# 4. In produzione, al rilascio:
npm run db:migrate:deploy
```

`npm run db:migrate:status` dice cosa risulta applicato e cosa no.

`db:migrate:deploy` è l'unico script senza `guard:not-prod`, di proposito: è il
solo comando che **deve** poter girare contro la produzione. Non genera nulla e
non cancella nulla — applica soltanto le migrazioni non ancora registrate.

## Regole che costano ore se si scoprono sul campo

1. **Dentro questa cartella ci vanno solo migrazioni vere.** Prisma tratta ogni
   sottocartella come una migrazione. Una sottocartella senza `migration.sql`
   fa fallire il deploy con
   `Error: P3015 — Could not find the migration file at migration.sql`.
   È già successo: `post-push/` stava qui e rompeva `migrate deploy`. Ora è in
   `prisma/sql/`. **Qualunque altro SQL va lì, non qui.**

2. **Non modificare una migrazione già applicata.** Prisma ne conserva il
   checksum in `_prisma_migrations` e al deploy successivo si ferma. Per
   correggere, si scrive una migrazione nuova.

3. **`prisma migrate reset` cancella il database.** Su questa macchina
   `DATABASE_URL` punta alla **produzione** (Supabase): non esiste uno script
   npm che lo esponga, e non va aggiunto.

4. **Gli indici parziali sono invisibili a Prisma.** Rigenerando la baseline,
   il predicato `WHERE` va rimesso a mano — dettagli e verifica rapida in
   `prisma/sql/README.md`.

5. **`prisma db push --skip-generate` non esiste in Prisma 7**: stampa l'help e
   **non esegue nulla**, lasciando credere che sia andato tutto bene.

## Il database dei test non passa di qui

`src/test/integration/global-setup.ts` costruisce il database di prova con
`prisma db push` più `prisma/sql/constraints.sql`, non con le migrazioni. È una
scelta: il push è più veloce e i test non hanno bisogno di storia. Ricordarsene
quando si aggiunge una migrazione che fa qualcosa che il push non fa (un
backfill di dati, per esempio): quella parte i test non la vedranno.
