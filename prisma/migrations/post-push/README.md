# Vincoli post-push

SQL che va applicato **dopo** `prisma db push`, perché esprime cose che Prisma
non sa dire: gli indici **parziali** (`CREATE UNIQUE INDEX ... WHERE ...`).

| File | Cosa contiene |
|---|---|
| `constraints.sql` | Vincoli di unicità che impediscono i duplicati contabili |

## L'ordine è obbligato

I vincoli di unicità **falliscono** se i duplicati esistono già. In produzione i
duplicati ci sono quasi certamente — sono esattamente il motivo per cui questi
vincoli vengono introdotti. Applicare `constraints.sql` su un database sporco
non corrompe niente, ma la `CREATE UNIQUE INDEX` si ferma con:

```
ERROR:  could not create unique index "ux_daily_closures_sede_giorno"
DETAIL:  Key (venue_id, date)=(clx…, 2026-08-05) is duplicated.
```

Quindi, nell'ordine:

1. **Assessment.** Contare i duplicati esistenti per ciascuno degli otto
   vincoli, su una copia dei dati di produzione. Lo script di assessment è
   materiale separato (agente F4).
2. **Bonifica.** Decidere con il titolare quale riga tenere per ogni gruppo di
   duplicati e cancellare o soft-deletare le altre. È una decisione contabile,
   non tecnica: due chiusure dello stesso giorno possono avere incassi diversi,
   e scegliere quella giusta richiede qualcuno che sappia cosa è successo.
3. **Applicazione.** Solo a duplicati zero:

   ```bash
   psql "$DATABASE_URL" -f prisma/migrations/post-push/constraints.sql
   ```

Saltare i primi due passi non è pericoloso — è solo inutile: lo script si
interrompe al primo vincolo violato (imposta `ON_ERROR_STOP` da sé) e i vincoli
successivi non vengono creati. Niente viene lasciato a metà su una singola
tabella, ma si resta con una parte dei vincoli applicati e una parte no.

### Dove i duplicati sono davvero possibili

L'assessment vero serve solo per i **cinque vincoli nuovi** — riconciliazioni,
fatture, le due varianti di occorrenza ricorrente, fornitori. Lì nessuno ha mai
impedito i doppioni, quindi ci sono.

I **tre convertiti** (chiusure, budget, movimenti bancari) sono un
*rilassamento* di un vincolo già in vigore: applicavano la stessa unicità
contando anche i cancellati, la versione parziale ne conta di meno. Se il
vincolo pieno era rispettato, il parziale lo è per forza. L'unico caso in cui
possono fallire è che il database di produzione sia andato in drift e quei
vincoli non ci siano mai stati davvero — cosa che la fotografia del drift, in
corso separatamente, dirà con certezza.

## Applicarlo due volte è sicuro

Lo script è idempotente. `CREATE UNIQUE INDEX IF NOT EXISTS` non tocca gli
indici già presenti, e i `DROP ... IF EXISTS` dei vecchi vincoli non sollevano
errore quando non c'è più niente da droppare. Rieseguirlo dopo ogni
`prisma db push` è la prassi giusta, non una precauzione.

## Perché anche dopo ogni push

Rimuovendo i `@@unique` composti dallo schema, `prisma db push` non li ricrea
più. Ma il push **non conosce** gli indici parziali: li vede come oggetti
estranei allo schema e, a seconda della versione, può segnalarli come drift o
proporne la rimozione. Se un push dovesse cancellarli, riapplicare questo file
li rimette a posto.

## Bloccaggi durante l'applicazione

`CREATE UNIQUE INDEX` prende un lock che blocca le **scritture** sulla tabella
per tutta la durata della creazione (le letture continuano). Sulle dimensioni
attuali del database sono frazioni di secondo. Se un giorno le tabelle
crescessero al punto da rendere il fermo percettibile, la variante
`CREATE UNIQUE INDEX CONCURRENTLY` non blocca le scritture — al prezzo che, in
presenza di duplicati, lascia dietro un indice `INVALID` da rimuovere a mano
invece di fallire pulitamente. Con l'ordine descritto sopra (bonifica prima)
il rischio è basso, ma la versione bloccante resta quella giusta finché il
fermo non si nota.
