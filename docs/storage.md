# Archiviazione dei file caricati

Riguarda: cedolini e documenti dipendente, allegati dello scadenzario.

Tutto l'accesso ai file passa da **`src/lib/storage.ts`** (`putFile`, `getFile`,
`deleteFile`). Nessuna route deve usare `fs` direttamente: se serve un nuovo tipo
di upload, si aggiunge una chiave a quel modulo.

Le chiavi sono percorsi relativi con `/`, per esempio:

```
documents/cedolini/<uuid>.pdf
documents/attestati/<uuid>.pdf
scadenzario/<uuid>.pdf
```

## Backend

Il backend si sceglie da solo in base alle variabili d'ambiente:

| Condizione | Backend |
|---|---|
| `SUPABASE_URL` **e** `SUPABASE_SERVICE_ROLE_KEY` presenti | Supabase Storage |
| altrimenti | filesystem sotto `UPLOAD_ROOT` |

### Produzione oggi: filesystem su volume Railway

Il filesystem del container Railway è **effimero**: senza un volume, i file
caricati spariscono a ogni deploy. Per questo:

- è montato il volume `weiss-gestionale-volume` su **`/data/uploads`** (5 GB);
- la variabile **`UPLOAD_ROOT=/data/uploads`** fa scrivere il codice dentro al volume.

Non rimuovere nessuna delle due cose senza aver prima migrato a Supabase Storage:
il risultato sarebbe la perdita silenziosa dei cedolini al deploy successivo.

In sviluppo `UPLOAD_ROOT` non è impostata e i file finiscono in `./uploads`
(cartella ignorata da git).

### Passare a Supabase Storage

Utile se servono CDN, backup gestiti o più repliche dell'app. Passi:

1. Nel progetto Supabase creare un bucket **privato** (nome di default atteso: `uploads`).
2. Impostare su Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e — se il
   bucket ha un nome diverso — `SUPABASE_STORAGE_BUCKET`.
3. Copiare i file esistenti dal volume al bucket mantenendo gli stessi percorsi
   relativi (le chiavi salvate a database non cambiano).
4. Al riavvio `getStorageBackend()` restituisce `supabase` senza altre modifiche
   al codice.

La `SERVICE_ROLE_KEY` bypassa le policy RLS: deve stare solo lato server, mai in
una variabile `NEXT_PUBLIC_*`.

## Nota sui permessi

I download passano sempre dalle route API, che verificano la sessione e la
proprietà del documento (un dipendente scarica solo i propri cedolini). I file
non sono mai serviti staticamente: non aggiungere il bucket o la cartella a un
percorso pubblico.
