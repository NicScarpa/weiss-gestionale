# Area funzionale — Conti bancari, team e movimenti

Passata dell'11 agosto sulle aree rimaste dal piano residuo: conti bancari e
connessione PSD2, multi-azienda e gestione team, viste dei movimenti, e la
verifica sulle funzioni da power user.
Convenzione dei tag come in `../01-inventario-rotte.md`.

---

## 1. Conti bancari e PSD2

Il risultato principale — la connessione bancaria è costruita ma non consegnata
ai clienti — è documentato per esteso in `../01-inventario-rotte.md`, cap. 4.11.
Qui il resto della schermata.

### 1.1 La scheda del conto `[OSSERVATO]`
Rotta `/settings/bank-accounts`, sottotitolo «Gestisci i tuoi conti correnti e
saldi iniziali». Una scheda per conto, con nome, banca, **IBAN completo**, e
quattro grandezze:

| Voce | Conto Principale (Intesa Sanpaolo) |
|---|---|
| Saldo Iniziale | 25.000,00 € al 10/08/26 |
| Saldo Contabile | 119.693,07 € |
| Saldo Disponibile | 169.693,07 € |
| Fido di Cassa: accordato / utilizzato / residuo | 50.000 / 0 / 50.000 € |

`[DEDOTTO]` Il **saldo iniziale con data** è la chiave del modello: il saldo
contabile non arriva dalla banca, è il saldo iniziale più i movimenti caricati.
È lo schema di chi importa file, e spiega perché la connessione automatica non
sia necessaria al funzionamento del prodotto.

Il conto deposito FinecoBank, che non ha fido, mostra solo due delle quattro
voci: la sezione «Fido di Cassa» sparisce invece di comparire a zero. Coerente
con l'etichetta «Manca fido» osservata nella Tesoreria.

`[OSSERVATO]` Azioni per conto: Modifica, Elimina, e **Imposta predefinito**
sui conti non predefiniti.

---

## 2. Multi-azienda e gestione team

### 2.1 Il modello dei permessi è a due ruoli `[OSSERVATO]`

`/settings/profile` ha cinque schede: Profilo, Cambia Password, **Gestione
Team**, Log Attività, Statistiche Utilizzo.

La scheda Team mostra i membri e la sezione «Inviti», con lo stato vuoto
«Nessun invito pendente». Il nostro unico membro risulta:

```json
{"id":71,"role":"admin","isOwner":true,
 "user":{"email":"info@weisscafe.com","locale":"it",
         "isSuspended":false,"lastLoginAt":"2026-08-11T04:17:24.122Z"}}
```

`[OSSERVATO]` Il modulo «Invita Membro» chiede un'email e un ruolo, e i ruoli
disponibili sono **due soli**: **Membro** e **Amministratore**.

`[OSSERVATO]` Il modello distingue anche `isOwner` dal ruolo, quindi la
proprietà dell'azienda è una terza dimensione oltre ai due ruoli — coerente con
l'endpoint `/api/company/transfer-ownership`.

⚠️ **Nessun invito è stato inviato**: il flusso è stato aperto e documentato,
non eseguito, perché avrebbe spedito un'email a un indirizzo reale.

### 2.2 Il ruolo del commercialista non esiste `[OSSERVATO]`

La pagina pubblica `/accesso-commercialista` vende un add-on a 3,99 €/mese
descrivendone i permessi con precisione: «Non può modificare nulla · Vede solo i
dati · Può aiutarti meglio», con la formula «Non è un controllo. È una
collaborazione.»

Nel modulo di invito **quel ruolo non c'è**. Le uniche scelte sono Membro e
Amministratore, e nessuna delle due è di sola lettura.

`[IPOTESI]` Il ruolo compare solo attivando l'add-on, che sul nostro account non
è attivo — ma va ricordato che l'add-on «Accesso Commercialista» **non esiste
nemmeno nel catalogo di fatturazione** letto dall'API, che ne elenca due soli.
La spiegazione alternativa, cioè che la funzione sia venduta ma non ancora
costruita, è almeno altrettanto plausibile.

### 2.3 Il selettore di azienda non è osservabile `[OSSERVATO]`

La novità principale della versione 0.26.5 recita: «Ora puoi appartenere a più
aziende con lo stesso account e passare dall'una all'altra in qualsiasi momento
**dal menu profilo in alto a destra**».

Il menu profilo contiene: Profilo · Impostazioni · Abbonamento · Dati di
Fatturazione · Esci. **Nessun selettore di azienda.**

`[DEDOTTO]` Con ogni probabilità il selettore appare solo quando l'utente
appartiene a due o più aziende, e con un account singolo non è osservabile. Non
è quindi un difetto, ma il limite dell'osservazione: la funzione di punta della
versione corrente **non è verificabile con un solo account**, e resta l'unica
grande novità annunciata di cui non posso dire nulla di diretto.

### 2.4 Statistiche di utilizzo `[OSSERVATO]`

Da `/api/company/usage-statistics`, una riga per entità con totale, mese
corrente e media mensile:

| Entità | Totale | Questo mese | Media mensile |
|---|---|---|---|
| Fatture | 82 | 21 | 16 |
| Movimenti bancari | 52 | 12 | 10 |
| Movimenti carta | 26 | 5 | 9 |
| Movimenti gateway | 0 | 0 | 0 |
| Altre uscite/entrate | 20 | 9 | 7 |
| Costi ricorrenti | 20 | 20 | 20 |

`[DEDOTTO]` È il contatore che alimenta il limite «movimenti al mese» dei piani,
esposto all'utente in modo trasparente. Mostrare la **media mensile** accanto al
mese corrente è l'accorgimento che rende il dato azionabile: dice se stai per
sforare per un picco o per una tendenza.

---

## 3. Movimenti bancari

Rotta `/transactions`, sottotitolo «Gestisci e categorizza i movimenti del
conto».

### 3.1 Quattro schede con i conteggi `[OSSERVATO]`

**Attivi (49) · Deleghe F24 (2) · CBILL-PagoPA (1) · Cestino (0)**

`[DEDOTTO]` Due tipologie di pagamento tipicamente italiane — la delega F24 e il
bollettino CBILL/pagoPA — hanno una scheda propria invece di stare mescolate agli
altri movimenti. È una scelta di dominio precisa: sono le uscite che l'utente
cerca per prime quando controlla gli adempimenti, e trovarle separate evita di
filtrarle ogni volta.

`[OSSERVATO]` Il **Cestino** è una scheda con contatore, non un menu nascosto:
la cancellazione è morbida ed è visibile quanto il resto. Coerente col campo
`trashedAt` del modello e con l'endpoint `/api/transactions/trash`.

### 3.2 Colonne e totali `[OSSERVATO]`
Colonne: Data · Descrizione · **Causale** · Conto Bancario · Stato · Importo ·
Azioni. Ogni riga porta un badge dell'origine, «Manuale» su tutto il dataset.

Fascia dei totali: Totale Entrate 158.382,92 € · Totale Uscite 62.689,85 € ·
**Saldo Netto 95.693,07 €**.

`[OSSERVATO]` La colonna **Causale** non riporta la causale bancaria grezza ma
una classificazione: «Incasso fattura», «Incasso», «Pagamento fattura»,
«Mutuo», «Leasing», «Utenze», «Software», «Commissioni», oppure «-» quando
manca.

`[DEDOTTO]` È una seconda dimensione di classificazione accanto alla categoria
contabile: la categoria dice *a quale voce* imputare, la causale dice *che tipo
di operazione* è. Distinguerle permette di riconoscere un pagamento fattura da
un giroconto senza guardare la controparte.

### 3.3 Filtri e azioni in blocco `[OSSERVATO]`
Ricerca testuale, filtro per tipo, **filtro per conto bancario**, «Solo Non
Riconciliati», e un pulsante che apre i filtri avanzati. Casella «seleziona
tutto» in testa alla tabella, quindi azioni in blocco. Paginazione con prima,
precedente, successiva, ultima, e scelta della dimensione di pagina.

`[OSSERVATO]` Il movimento datato **20/08/2026**, cioè nel futuro, compare
regolarmente in cima all'elenco ordinato per data decrescente. È lo stesso
movimento che gonfia il «Saldo Attuale» del cruscotto
(vedi `../04-logiche-di-calcolo.md`, cap. 13): la lista non lo distingue in alcun
modo da un movimento già avvenuto.

---

## 4. Funzioni da power user: non ci sono `[VERIFICATO]`

Il metodo chiede di verificare scorciatoie da tastiera e ricerca globale. Fino
a oggi avevo concluso che non esistessero solo perché non le avevo viste; ora è
stato provato.

| Prova | Esito |
|---|---|
| `Cmd+K` | nessun pannello |
| `/` | nessun pannello |
| `?` | nessun pannello |
| Campo di ricerca nell'intestazione | assente |
| Elementi `[cmdk-root]` nel DOM | **0** |

`[DEDOTTO]` L'ultima riga è la più conclusiva: la libreria `cmdk`, che è lo
standard di fatto per le palette comandi in ambiente React, non è nemmeno
presente nell'interfaccia resa. Non è una scorciatoia nascosta: la funzione non
esiste.

`[DEDOTTO]` La ricerca è sempre **locale alla schermata** — ogni lista ha il
proprio campo — e non esiste un modo di cercare un cliente o una fattura da
qualunque punto dell'applicazione. Su un prodotto con novantatré rotte è un
costo di navigazione che si paga ogni giorno.

---

## 5. Cosa ne ricaviamo

| Accorgimento | Perché funziona | Come lo faremmo |
|---|---|---|
| Schede separate per F24 e CBILL/pagoPA con contatore | Sono le uscite che si cercano per prime negli adempimenti | Filtro predefinito basato sui flag `isF24Delegation` e `isCbillPagopa`, esposto come scheda |
| Cestino come scheda visibile col conteggio | La cancellazione morbida serve a poco se è nascosta | Scheda «Cestino» accanto alle altre, alimentata da `trashedAt` |
| Causale accanto alla categoria | Distingue il tipo di operazione dall'imputazione contabile | Due campi distinti, non un solo tassonomico sovraccarico |
| Saldo iniziale con data sul conto | Rende esplicito da dove parte il calcolo del saldo | Campi `saldoIniziale` e `dataSaldoIniziale` sul conto |
| Media mensile accanto al mese corrente nei consumi | Dice se stai sforando per un picco o per una tendenza | Due colonne nel contatore d'uso, non una |
| Sezione fido che sparisce quando non c'è | Meno rumore sui conti che non ne hanno | Rendering condizionale, più un invito alla configurazione dove serve |

**Da non copiare:** l'assenza di una ricerca globale su un prodotto con
novantatré rotte, e un elenco movimenti che non distingue in alcun modo le righe
con data futura da quelle già avvenute.
