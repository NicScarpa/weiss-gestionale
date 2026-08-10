# Censimento dei dati contabili corrotti

Questi script **fotografano** i dati già danneggiati in produzione. Non li
riparano e non li possono riparare: sono in sola lettura per costruzione.

Servono a decidere. Prima di scrivere un solo script di bonifica bisogna sapere
quante righe sono coinvolte, quanto valgono, quali si possono correggere in
automatico e quali richiedono che qualcuno guardi la singola riga e dica cosa
farne. È quello che producono.

---

## ⚠️ Avvertenza per chi li esegue

**Vanno eseguiti contro la produzione, in sola lettura, dal titolare.**

Chi ha scritto questi script non ha, e non deve avere, le credenziali della
produzione. L'esecuzione spetta a chi le possiede.

Prima di lanciarli:

1. **Preferire una replica o un backup ripristinato.** Il censimento non scrive
   nulla, ma la regola d'oro resta: se esiste una copia su cui lavorare, si
   lavora sulla copia.
2. **Se si esegue sulla produzione viva, fare prima un backup.** Non perché
   questi script possano rovinare qualcosa, ma perché il passo successivo — la
   bonifica — modificherà i dati, e il backup serve comunque.
3. **Controllare l'intestazione del rapporto** prima di lasciarlo proseguire:
   la prima cosa che stampa è su quale database si è collegato.

L'esecuzione apre una transazione lunga quanto il censimento (qualche secondo
su una base di queste dimensioni). Non prende blocchi che fermino l'operatività:
legge e basta.

---

## Come si lanciano

```bash
source ~/.nvm/nvm.sh && nvm use 22

DATABASE_URL="postgresql://utente:password@host:5432/database" \
  npx tsx scripts/remediation/assess/index.ts
```

Il rapporto esce a schermo. Per conservarlo:

```bash
DATABASE_URL="…" npx tsx scripts/remediation/assess/index.ts | tee censimento.txt
```

### Opzioni

| Opzione | Effetto |
| --- | --- |
| `--url=…` | indirizzo del database, in alternativa a `DATABASE_URL` |
| `--solo=a,c` | esegue solo i controlli indicati (`a`, `b`, `c`, `d`) |
| `--esempi=N` | righe di esempio per raggruppamento (predefinito 10) |
| `--cartella=…` | dove depositare i file JSON |
| `--senza-json` | stampa soltanto, non scrive alcun file |
| `--aiuto` | elenco delle opzioni |

### Cosa producono

* **un rapporto leggibile su stdout**, scritto per il titolare: importi in euro,
  date in formato italiano, nessun gergo tecnico dove si può evitare;
* **un file JSON per controllo** in `scripts/remediation/assess/report/`,
  chiamato `<controllo>-<data e ora>.json`. Serve agli script di bonifica, che
  devono ritrovare per identificativo esattamente le righe fotografate.

I file JSON contengono dati aziendali (importi, beneficiari, ragioni sociali):
la cartella `report/` è esclusa dal controllo di versione e il suo contenuto non
va allegato a un ticket né inviato per posta.

Gli IBAN non compaiono mai, né a schermo né nei file: non vengono nemmeno
selezionati dal database. Dove serve saperne l'esistenza, il rapporto dice solo
«presente» o «assente».

---

## I quattro controlli

### (a) `a-movimenti-pagamento.ts` — movimenti da pagamento col segno invertito

`src/app/api/pagamenti/[id]/esegui/route.ts` registra ogni pagamento eseguito
come **dare** sul registro banca. Siccome il saldo si calcola
`apertura + dare − avere`, ogni pagamento ha **alzato** il saldo invece di
abbassarlo.

Il rapporto elenca i movimenti collegati a un pagamento e registrati in dare,
li ripartisce per tipo (BONIFICO / F24 / ALTRO) con conteggio, somma ed esempi
in chiaro, e calcola di quanto si sposterebbe il saldo della banca correggendoli.

### (b) `b-scadenze-data-pagamento.ts` — scadenze con data di pagamento fittizia

`src/app/api/scadenzario/[id]/stato/route.ts` scrive `dataPagamento = oggi`
quando una scadenza viene marcata SCADUTA, anche se non è stata pagata; il
pagamento vero, se arriva dopo, non corregge il dato.

Oltre a censire le scadenze coinvolte, il rapporto mostra **di quanto è falsata
la stima del ritardo tipico di ciascun fornitore**: la stima
(`src/lib/scadenzario/stima-data-attesa.ts`) legge proprio quelle date.

### (c) `c-duplicati-unicita.ts` — duplicati che impedirebbero i nuovi vincoli

Gli indici unici in preparazione non possono nascere su una tabella che contiene
già righe in conflitto. Il rapporto cerca i duplicati su sette chiavi
(riconciliazioni, fatture elettroniche, scadenze da ricorrenza, chiusure di
cassa, budget, movimenti bancari per riferimento e per chiave naturale), elenca
i vincoli di unicità **già presenti** — perché un risultato vuoto può voler dire
«non ce ne sono» oppure «sono già impediti» — e conta le righe cancellate
logicamente, che farebbero fallire un indice unico totale ma non uno parziale.

### (d) `d-fornitori-duplicati.ts` — fornitori duplicati per partita IVA

`Supplier.vatNumber` non è unico. Due schede per lo stesso fornitore spezzano in
due il suo storico. Il rapporto raggruppa per partita IVA normalizzata, conta i
dati collegati a ciascuna scheda e propone un superstite.

---

## Perché non usano il client Prisma dell'applicazione

Gli script parlano con il database attraverso `pg`, non attraverso
`src/lib/prisma`. È una scelta, non una scorciatoia.

1. **Il soft delete nasconderebbe proprio le righe che cerchiamo.** Il client
   Prisma monta un'estensione che inietta `deletedAt: null` in ogni
   `findMany`, `count`, `aggregate` e `groupBy`. Un censimento deve vedere anche
   le righe cancellate logicamente: un duplicato cancellato occupa comunque lo
   spazio di un indice unico totale, e un pagamento cancellato può aver lasciato
   dietro di sé il movimento sbagliato.
2. **La cifratura verrebbe disfatta in lettura.** L'estensione di cifratura
   decifra i campi sensibili appena letti. Leggendo grezzo, l'IBAN resta cifrato
   per tutto il percorso e il censimento gira senza `ENCRYPTION_KEY`: l'unico
   segreto che serve è l'indirizzo del database.
3. **Il divieto di scrittura lato server non ha equivalenti in Prisma.**

---

## Perché non possono scrivere

Cinque barriere indipendenti, descritte in `lib/db.ts`:

1. la connessione si apre con `default_transaction_read_only=on` passato nel
   pacchetto di avvio: **è il server a rifiutare le scritture**, non il codice;
2. all'apertura una sonda pretende dal server il rifiuto di una `UPDATE` che non
   tocca alcuna riga; se venisse accettata, il censimento si ferma;
3. tutto gira dentro `BEGIN … REPEATABLE READ, READ ONLY`, che oltre a ribadire
   il divieto dà ai quattro controlli **la stessa istantanea** del database, così
   i numeri sono confrontabili fra loro;
4. la transazione si chiude sempre con `ROLLBACK`, mai con `COMMIT`;
5. il testo di ogni query viene controllato: deve iniziare per `SELECT` o `WITH`,
   non può contenere più di un'istruzione né alcuna parola di scrittura.

Verifica eseguita su un database di prova:

```
1) Con un client normale la stessa scrittura passa:
   UPDATE accettata, righe toccate: 0
2) Con SolaLettura il server rifiuta la stessa scrittura:
   rifiutata dal server — SQLSTATE 25006: cannot execute UPDATE in a read-only transaction
   INSERT rifiutata — SQLSTATE 25006: cannot execute INSERT in a read-only transaction
   CREATE TABLE rifiutata — SQLSTATE 25006: cannot execute CREATE TABLE in a read-only transaction
```

---

## Struttura

```
scripts/remediation/assess/
├── index.ts                        comando unico: esegue i quattro controlli
├── a-movimenti-pagamento.ts        (a) movimenti col segno invertito
├── b-scadenze-data-pagamento.ts    (b) date di pagamento fittizie
├── c-duplicati-unicita.ts          (c) duplicati sulle chiavi in via di unicità
├── d-fornitori-duplicati.ts        (d) fornitori doppi per partita IVA
├── lib/
│   ├── db.ts                       connessione in sola lettura e sue barriere
│   ├── format.ts                   tabelle, importi e date del rapporto
│   ├── piva.ts                     normalizzazione della partita IVA in SQL
│   ├── rapporto.ts                 scrittura dei file JSON
│   └── tipi.ts                     tipi condivisi
└── report/                         rapporti JSON (contenuto non versionato)
```

Ogni file dichiara in testa di essere in sola lettura e **con quale criterio
distingue una riga corrotta da una legittima**: è la parte da leggere per prima
se si mette in dubbio un numero del rapporto.
