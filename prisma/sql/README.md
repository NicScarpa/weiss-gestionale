# SQL scritto a mano

Questa cartella contiene SQL che **non** passa da Prisma, perché esprime cose
che Prisma non sa dire.

| File | Cosa contiene | Chi lo applica |
|---|---|---|
| `constraints.sql` | 8 indici unici **parziali** (`CREATE UNIQUE INDEX … WHERE …`) | l'harness dei test di integrazione; a mano in riparazione |
| `enable_rls_all_tables.sql` | Row Level Security e policy su 59 tabelle (layer Supabase) | a mano, sul database Supabase |

> ## Perché non sta in `prisma/migrations/`
>
> Ci stava, e **rompeva `prisma migrate deploy`**. Prisma tratta ogni
> sottocartella di `prisma/migrations/` come una migrazione: non trovando
> `post-push/migration.sql` si fermava con
> `Error: P3015 — Could not find the migration file at migration.sql`.
> Misurato per esecuzione l'8 agosto 2026 su un database locale: il deploy
> applicava `0_baseline` e poi moriva.
>
> **Regola generale: dentro `prisma/migrations/` ci vanno solo migrazioni
> vere.** Qualunque altro SQL sta qui.

---

## Gli indici parziali sono già nella baseline

Dall'8 agosto 2026 `prisma/migrations/0_baseline/migration.sql` contiene gli
otto indici **con il loro predicato**. Un ambiente costruito con
`prisma migrate deploy` li ha già: **non serve applicare `constraints.sql`
dopo un deploy.**

⚠️ **Il predicato è stato riattaccato a mano, e va tenuto d'occhio.** Prisma
non modella gli indici parziali: l'introspezione ne conserva nome e colonne e
**scarta la clausola `WHERE`**. La baseline generata da
`prisma migrate diff --from-empty --to-config-datasource` conteneva otto indici
unici **pieni** — vincoli *più stretti* di quelli veri, che reintroducevano i
bug documentati più sotto. Se un giorno la baseline venisse rigenerata, il
predicato andrà rimesso.

Verifica rapida che i predicati ci siano ancora:

```bash
grep -c 'WHERE' prisma/migrations/0_baseline/migration.sql   # atteso: >= 8
```

### Il problema è più generale degli indici parziali

Prisma modella un sottoinsieme di PostgreSQL. Tutto ciò che sta fuori
sopravvive nel database ma **sparisce da qualunque baseline rigenerata**, in
silenzio: l'introspezione non avvisa di ciò che non sa leggere.

| Oggetto | Prisma lo modella? | Oggi in produzione |
|---|---|---|
| Indici parziali (`… WHERE …`) | no — tiene nome e colonne, **scarta il predicato** | 8 nella baseline, **+1** da `conti/piano-v4` |
| Policy e Row Level Security | no | 59 tabelle, 59 policy (+1 tabella da `conti/piano-v4`) |
| Vincoli `CHECK` | no | 0 nella baseline, **+1** da `conti/piano-v4` |
| Trigger, funzioni, viste | no | nessuno |

Il caso peggiore non è quello che sparisce: è **l'indice parziale, che non
sparisce ma cambia significato**. Un vincolo mancante è un buco silenzioso; un
vincolo diventato più stretto blocca operazioni legittime in produzione.

**Regola pratica:** ogni volta che si aggiunge al database qualcosa che non sta
in `schema.prisma`, aggiungerlo anche a questa tabella.

### I due oggetti di `conti/piano-v4`

Vivono nelle migrazioni `20260807000000_piano_v4_centri_costo` e
`20260808000000_centro_operativo_provenienza`, non in `constraints.sql`: sono
nati insieme alle tabelle e alle colonne che vincolano, e separarli darebbe una
migrazione che crea una struttura già sbagliata per il tempo che passa fino
all'esecuzione del secondo file.

**1. `cost_centers_one_default` — indice unico PARZIALE**

```sql
CREATE UNIQUE INDEX cost_centers_one_default ON cost_centers (is_default) WHERE is_default;
```

Il predicato è tutto. Senza `WHERE is_default` l'indice diventa un unico
*pieno* su una colonna booleana, e allora `is_default = false` può stare su una
riga sola: il sistema accetterebbe **un solo centro di costo in tutto**, invece
di un solo centro *predefinito*. È esattamente il modo di sbagliare descritto
sopra — il vincolo non sparisce, si stringe — e qui il danno è immediato,
perché i centri sono quattro (STR, WEISS, VV, CAS).

Verifica che il predicato ci sia ancora:

```bash
psql "$DATABASE_URL" -c "SELECT indexdef FROM pg_indexes WHERE indexname='cost_centers_one_default';"
# deve finire con: WHERE is_default
```

**2. `journal_entries_cost_center_source_check` — vincolo CHECK**

```sql
CHECK (cost_center_source IS NULL OR cost_center_source IN ('scelto','piano','supposto'))
```

È il primo `CHECK` del progetto. Difende la colonna che dice **da dove viene**
l'imputazione di un movimento: scelta da una persona, dettata dalla regola del
conto, o indovinata dal sistema. Su quella distinzione si decide se un
movimento può essere promosso a «verificato» senza che nessuno l'abbia
guardato; un valore fuori elenco la renderebbe non interpretabile.

## Dove serve ancora `constraints.sql`

1. **I test di integrazione.** L'harness costruisce il database di prova con
   `prisma db push` — che gli indici parziali non li conosce — e poi applica
   questo file (`src/test/integration/global-setup.ts`, `applyConstraints()`).
   Senza, i test sui duplicati contabili darebbero un verdetto sull'ambiente
   invece che sul codice.
2. **Riparazione.** Se un `db push` dovesse cancellare gli indici (li vede come
   oggetti estranei allo schema), questo file li rimette a posto.

```bash
psql "$DATABASE_URL" -f prisma/sql/constraints.sql
```

Lo script è idempotente: `CREATE UNIQUE INDEX IF NOT EXISTS` non tocca gli
indici già presenti, i `DROP … IF EXISTS` non errano su ciò che non c'è.
Eseguirlo due volte non cambia nulla.

## L'ordine è obbligato, su un database con dati

I vincoli di unicità **falliscono** se i duplicati esistono già — e sono
esattamente il motivo per cui i vincoli vengono introdotti:

```
ERROR:  could not create unique index "ux_daily_closures_sede_giorno"
DETAIL:  Key (venue_id, date)=(clx…, 2026-08-05) is duplicated.
```

Quindi: **assessment** dei duplicati → **bonifica** (decisione contabile, non
tecnica: due chiusure dello stesso giorno possono avere incassi diversi) →
**applicazione**. Saltare i primi due passi non corrompe niente: lo script si
ferma al primo vincolo violato (imposta `ON_ERROR_STOP` da sé), lasciando una
parte dei vincoli applicati e una parte no.

L'assessment serve davvero solo per i **cinque vincoli nuovi** (riconciliazioni,
fatture, le due varianti di occorrenza ricorrente, fornitori): lì nessuno ha mai
impedito i doppioni. I **tre convertiti** (chiusure, budget, movimenti bancari)
sono un *rilassamento* di un vincolo già in vigore — se il vincolo pieno era
rispettato, il parziale lo è per forza.

## Bloccaggi durante l'applicazione

`CREATE UNIQUE INDEX` blocca le **scritture** sulla tabella per la durata della
creazione (le letture continuano). Sulle dimensioni attuali sono frazioni di
secondo. Se un giorno il fermo si notasse, `CREATE UNIQUE INDEX CONCURRENTLY`
non blocca le scritture — al prezzo che, in presenza di duplicati, lascia
dietro un indice `INVALID` da rimuovere a mano invece di fallire pulitamente.

---

## `enable_rls_all_tables.sql` — e cosa la baseline non sa

La produzione ha **RLS attiva su 59 tabelle con 59 policy**. La baseline ne
contiene **zero**: sono oggetti Supabase, fuori dal modello Prisma.

**Conseguenza da conoscere:** un ambiente ricostruito con `migrate deploy`
— staging, un locale, un ripristino — nasce **senza RLS**. Per la produzione
non cambia nulla (l'applicazione si connette come `postgres`, che RLS lo
bypassa), ma un ambiente nuovo esposto all'API PostgREST di Supabase sarebbe
aperto. Su un ambiente del genere questo file va applicato a mano:

```bash
psql "$DATABASE_URL" -f prisma/sql/enable_rls_all_tables.sql
```

## Gli indici di performance, invece, stanno nello schema

`@@index` Prisma li esprime benissimo, e lo schema è la fonte di verità dove
può esserlo. Elencati qui solo perché li si trovi cercando in questa cartella:
`payments (venue_id, stato)` · `payments (data_esecuzione)` ·
`schedules (venue_id, data_attesa)` · `categorization_rules (venue_id)` ·
`cash_flow_forecasts (venue_id)` · `daily_closures (venue_id, date)` ·
`budgets (venue_id, year)` · `bank_transactions (venue_id, bank_reference)`.

Gli ultimi tre non sono facoltativi: rimpiazzano gli `@@unique` rimossi dallo
schema, perché la versione parziale copre solo le query che filtrano i
cancellati.
