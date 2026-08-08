# Per chi integra `conti/piano-v4`: cosa fare con i due SQL scritti a mano

**Scritto l'8 agosto 2026, subito dopo la baseline delle migrazioni
(PRIORITÀ 0 di `audit/PIANO-RESIDUO.md`).** Riguarda una sessione diversa da
quella che ha scritto questo file: `conti/piano-v4` non è stato toccato.

---

## Il fatto che cambia tutto

**Nessun oggetto di `piano-v4` è in produzione.** Verificato l'8 agosto contro
il database vero, in sola lettura:

| Oggetto | In produzione |
|---|---|
| tabella `cost_centers` | **assente** |
| enum `CostCenterRule` | **assente** |
| colonna `journal_entries.cost_center_id` | **assente** |
| colonna `journal_entries.cost_center_source` | **assente** |

Quindi i due SQL sono **da applicare**, non da dichiarare applicati. È il caso
semplice: diventano due migrazioni normali.

## Cosa è cambiato sotto i piedi di quel branch

`conti/piano-v4` è derivato da `main` **190 commit fa** (base `aae73be`), prima
di tutta la remediation. Su `main` nel frattempo:

1. **Esiste un registro delle migrazioni.** `_prisma_migrations` in produzione
   contiene `0_baseline`, la fotografia dello schema all'8 agosto. In produzione
   **non si usa più `db push`**: solo `npm run db:migrate:deploy`.
2. **`prisma/migrations/post-push/` non esiste più**: è diventata
   `prisma/sql/`. Stava dentro `prisma/migrations/` e faceva fallire
   `migrate deploy` con `P3015`.
3. **Otto indici unici parziali** (`prisma/sql/constraints.sql`) sono in
   produzione dal 7 agosto e dentro la baseline. `conti/piano-v4` non li ha
   nemmeno nel repository: quando i rami convergeranno, `prisma/sql/` arriverà
   da `main`.

## I due file, così come sono

Entrambi ben fatti: idempotenti, commentati, con il perché accanto al cosa.
Non serve riscriverli, solo spostarli.

| File | Cosa fa |
|---|---|
| `prisma/migrations/2026-08-07_piano_v4_centri_costo.sql` (117 righe) | enum `CostCenterRule`, tabella `cost_centers`, colonne di supporto, RLS sulla nuova tabella, indice parziale `cost_centers_one_default` |
| `prisma/migrations/2026-08-08_centro_operativo_provenienza.sql` (47 righe) | colonna `journal_entries.cost_center_source` + vincolo `CHECK` sui tre valori ammessi |

Il secondo dipende dal primo e va applicato dopo.

## Come convertirli

Dopo aver allineato `conti/piano-v4` a `main`:

```bash
mkdir -p prisma/migrations/20260807000000_piano_v4_centri_costo
mkdir -p prisma/migrations/20260808000000_centro_operativo_provenienza

git mv prisma/migrations/2026-08-07_piano_v4_centri_costo.sql \
       prisma/migrations/20260807000000_piano_v4_centri_costo/migration.sql
git mv prisma/migrations/2026-08-08_centro_operativo_provenienza.sql \
       prisma/migrations/20260808000000_centro_operativo_provenienza/migration.sql
```

Il nome della cartella **deve** essere `<timestamp>_<nome>` e il file dentro
**deve** chiamarsi `migration.sql`: Prisma ordina le migrazioni per nome di
cartella, e una cartella senza `migration.sql` fa fallire il deploy.

Poi, prima del rilascio:

```bash
npm run db:migrate:status     # deve elencare le due migrazioni come non applicate
npm run db:migrate:deploy     # le applica in ordine
```

### Provalo prima su un database locale vuoto

Non è una formalità: è così che sono stati trovati i due difetti della
baseline.

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql -h 127.0.0.1 -p 5433 -U nicolascarpa -d postgres \
  -c "DROP DATABASE IF EXISTS piano_v4_check;" -c "CREATE DATABASE piano_v4_check;"

source ~/.nvm/nvm.sh && nvm use 22
DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/piano_v4_check" \
  npx prisma migrate deploy
```

Deve applicare **tre** migrazioni (`0_baseline` + le due nuove) e finire con
«All migrations have been successfully applied».

## Due cose che Prisma perderà, e che vanno ricordate

`conti/piano-v4` introduce due oggetti che **Prisma non modella**. Restano nel
database, ma sparirebbero da qualunque baseline rigenerata in futuro — in
silenzio, perché l'introspezione non avvisa di ciò che non sa leggere:

1. **`cost_centers_one_default`**, indice unico parziale
   (`WHERE "is_default"`). Sarà il **nono**. Prisma ne conserverebbe nome e
   colonne scartando il predicato, e il risultato — un unico *pieno* su
   `is_default` — permetterebbe **un solo centro di costo in tutto il sistema**,
   invece di uno solo *predefinito*.
2. **`journal_entries_cost_center_source_check`**, vincolo `CHECK`. Oggi in
   produzione non ce n'è nessuno: sarebbe il primo.

Quando questi entrano, vanno aggiunti alla tabella «cosa Prisma non modella» in
`prisma/sql/README.md`, che esiste apposta.

## Un dubbio che non ho sciolto

Il DDL del 7 agosto crea `cost_centers` **senza `venue_id`**: i centri di costo
sono globali, non per sede. Può essere deliberato — con una sede sola la
differenza non si vede — ma con la seconda sede diventa una decisione difficile
da invertire, perché i movimenti già imputati non sapranno a quale sede
appartiene il loro centro. **Va chiesto al committente prima del rilascio**,
non dopo.
