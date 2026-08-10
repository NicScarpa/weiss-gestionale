# W5 — F3 · Audit del modulo presenze (NoBadge)

Audit in sola lettura sul codice in produzione (`main`, `bc4841b`). Nessun file del modulo è
stato modificato. Perimetro reale: **39 route** (non 15) fra `attendance/`, `cartellino/`,
`portal/`, `leave-*`, `shift-*`, `politiche-orario/`, `promemoria-timbratura/`, più i **10 file**
di libreria in `src/lib/attendance/`.

---

## In due minuti

Il cuore del calcolo — `timekeeping-engine.ts` — è la parte migliore del gestionale che abbia
letto finora: funzioni pure, 139 test verdi, commenti che spiegano le decisioni di prodotto e non
il codice. Il turno a cavallo della mezzanotte, il cambio dell'ora, il turno spezzato e gli
arrotondamenti sono gestiti **correttamente**, e l'ho verificato eseguendo il motore, non
leggendolo.

I problemi non stanno nel calcolo. Stanno **ai bordi**: in cosa succede quando un dipendente
dimentica una timbratura, quando è in ferie ma lavora lo stesso, o quando se ne va a metà mese.
Sono cinque situazioni ordinarie in un bar, e in tutte e cinque il sistema produce un numero
sbagliato **senza mostrare nessun avviso**. È questo il punto che mi preoccupa più della gravità
dei singoli difetti: gli errori sono silenziosi, quindi arrivano al consulente del lavoro.

**Tre cose da sapere subito:**

1. Un dipendente che rientra dalla pausa senza timbrare l'entrata si vede pagare **anche la
   pausa**. Nell'esempio verificato: 13 ore invece di 4, cioè **123 € lordi in più in un solo
   giorno**, senza nessuna segnalazione.
2. Chi viene disattivato a metà mese **sparisce dall'export paghe insieme alle ore che ha
   lavorato**. Non compare nemmeno con una riga a zero: non c'è proprio.
3. L'interruttore «chiusura automatica» nella pagina Impostazioni presenze **non spegne niente**:
   il programma che chiude le timbrature non lo legge.

---

## Quanto costa, in euro

Conti fatti a 12 €/ora lordi, straordinario a 15 €/ora (+25%).

| Situazione | Ore vere | Ore pagate | Differenza |
|---|---|---|---|
| Rientro dalla pausa senza timbrare (difetto 1) | 4h00 → 48 € | 13h00 → 171 € | **+123 €** al giorno |
| Uscita dimenticata, chiusa dal sistema (difetto 2) | 6h00 → 72 € | 12h00 → 156 € | **+84 €** all'episodio |
| Uscita dimenticata **e** sistema fermo (difetto 3) | 6h00 → 72 € | 0h00 → 0 € | **−72 €** al dipendente |
| Ferie approvate ma giornata lavorata (difetto 4) | 6h00 → 72 € | 0h00 → 0 € | **−72 €** al dipendente |
| Dipendente cessato il giorno 15 (difetto 5) | 80h → 960 € | non compare | **−960 €** al dipendente |
| Pausa aperta e mai richiusa (difetto 8) | 8h00 → 96 € | 9h00 → 111 € | **+15 €** al giorno |

Con otto persone e due dimenticanze a settimana, si parla di **qualche centinaio di euro al mese**
che si muove nell'una o nell'altra direzione senza che nessuno se ne accorga.

---

# I difetti che valgono soldi

## 1. Chi rientra senza timbrare l'entrata si fa pagare anche la pausa — P1

`src/lib/attendance/timekeeping-engine.ts:171-174`

```ts
} else if (segments.length > 0) {
  const lastSegment = segments[segments.length - 1]
  lastSegment.end = Math.max(lastSegment.end, punch.minutes)
}
```

La regola dice: «un'uscita doppia dopo un turno chiuso lo estende». Serve a tollerare il doppio
tocco sul telefono, ed è testata a 5 minuti di distanza. Ma **non c'è nessun limite di distanza**,
e a nove ore di distanza fa pagare tutto il buco.

**Cosa succede davvero nel locale.** Giulia entra alle 9:00, timbra l'uscita alle 13:00, torna
alle 17:00 e — è il caso normale, perché ha già timbrato una volta quel giorno — si dimentica di
timbrare l'entrata. Alla sera timbra l'uscita alle 22:00.

Ho eseguito il motore su questo caso esatto:

```
IN 09:00, OUT 13:00, OUT 22:00
  ore riconosciute: 780 min = 13,00 h     (le ore vere sono 4)
  ordinarie 480 | straordinario 300 | avvisi: []
  passaggi: "Timbrature: entrata 09:00, uscita 22:00."
```

Il sistema le paga **13 ore invece di 4**: 9 ore mai lavorate, di cui 5 conteggiate come
straordinario. **123 € lordi in più**, in un giorno solo. La lista degli avvisi è **vuota**: nessun
triangolo giallo, nessuna anomalia da approvare, il cartellino esce pulito e l'export delle paghe
passa senza bloccarsi.

Peggio: la riga dei passaggi dice *«entrata 09:00, uscita 22:00»*, cioè il documento che dovrebbe
far scoprire l'errore lo nasconde, perché ha già fuso le due timbrature in una.

Vale anche sul turno spezzato: `IN 07 / OUT 13 / IN 17 / OUT 22 / OUT 23:30` dà **750 minuti
invece di 660**, sempre senza avvisi.

**Rimedio proposto.** Tenere la tolleranza, ma dargli un limite: estendere il turno solo se la
seconda uscita arriva entro pochi minuti dalla prima (per esempio la tolleranza di uscita già
configurata nella regola, o 15 minuti fissi). Oltre quel limite, l'uscita orfana va trattata come
**una nuova entrata mancante**: aprire un secondo turno che parte dall'ultima uscita, oppure
scartarla e alzare un avviso `ENTRATA_MANCANTE`. Qualunque delle due è meglio di pagare il buco,
ma la scelta è del titolare e va decisa con lui.

**Come verificarlo.** Il test manca: aggiungerne uno in
`src/lib/attendance/__tests__/timekeeping-engine.test.ts` accanto a quello che c'è già a riga 376
(«una doppia uscita estende il turno»), con le stesse timbrature ma a nove ore di distanza.

---

## 2. La chiusura automatica inventa l'orario di uscita — P1

`src/app/api/attendance/auto-clockout/route.ts:83-85`

```ts
const autoClockoutTime = new Date(
  clockIn.punchedAt.getTime() + maxHours * 60 * 60 * 1000
)
```

Quando un dipendente dimentica di timbrare l'uscita, il sistema gliela scrive **12 ore esatte dopo
l'entrata**. Non a fine turno: dodici ore, un orario che nessuno ha mai lavorato.

Mario ha il turno 07:00-13:00, entra alle 06:58, va via alle 13:05 e non timbra. Il sistema gli
scrive l'uscita alle **18:58**. Eseguito sul motore:

```
IN 06:58, OUT 18:58 (scritta dal sistema)
  ore riconosciute: 720 min = 12,00 h     (le ore vere sono circa 6)
  ordinarie 480 | straordinario 240 | avvisi: []
```

**156 € invece di 72 €: 84 € di troppo**, per una dimenticanza.

La cosa che fa più rabbia è che **il sistema sa già calcolare la fine del turno pianificato e non
la usa**: la funzione esiste, è collaudata e gestisce perfino il turno spezzato — è
`src/lib/attendance/sessioni-aperte.ts:93-107`, che produce `finePrevista` ed è usata dalla
chiusura di cassa. Il programma della chiusura automatica non la importa nemmeno.

**Rimedio proposto.** Chiudere alla fine del turno pianificato (`finePrevista` di
`sessioni-aperte.ts`) e ripiegare sulle 12 ore solo se quel giorno non c'era turno pianificato. In
più, far nascere l'uscita da `createManualPunch` invece che da una scrittura diretta: è l'unico
punto in cui viene generata l'anomalia che manda l'orario in revisione (vedi difetto 7).

---

## 3. Se il sistema resta fermo mezza giornata, quelle ore non le recupera più nessuno — P1

`src/app/api/attendance/auto-clockout/route.ts:55`

```ts
gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Ultime 24h
```

Il programma guarda solo le timbrature delle ultime 24 ore, e considera chiudibili quelle più
vecchie di 12 ore. La finestra utile è quindi di **12 ore soltanto**: un'entrata di lunedì alle
8:00 diventa chiudibile lunedì alle 20:00 e **esce dalla portata del sistema martedì alle 8:00**.

Se in quelle 12 ore il servizio non gira — un rilascio lungo, un guasto notturno di Railway, una
pausa del servizio — al giro successivo quella timbratura è già fuori e **nessun giro futuro la
guarderà mai più**. Resta aperta per sempre, e una giornata con l'entrata ma senza uscita vale
**zero ore** (`timekeeping-engine.ts:428-430`): il dipendente perde l'intera giornata.

Non è teoria: tutte le timbrature rimaste aperte **prima** che questo servizio entrasse in
funzione non sono mai state elaborate e sono ancora lì.

**Come contarle.** Sul database:

```sql
SELECT r.* FROM attendance_records r
WHERE r.punch_type='IN' AND r.punched_at < now() - interval '24 hours'
  AND NOT EXISTS (SELECT 1 FROM attendance_records o
                  WHERE o.user_id=r.user_id AND o.punch_type='OUT'
                    AND o.punched_at > r.punched_at);
```

Ogni riga che esce è una giornata pagata zero a qualcuno. **Vale la pena eseguirla prima di
qualsiasi correzione**, per sapere quanto è grande il problema arretrato.

**Rimedio proposto.** Togliere il limite delle 24 ore all'indietro, o portarlo ad almeno 30 giorni.
Il controllo che evita i doppioni (righe 70-81) c'è già ed è corretto, quindi allargare la
finestra è sicuro.

**Nota d'allarme:** la pagina Impostazioni permette di impostare la soglia a 24 ore
(`policies/[venueId]/route.ts:61`, `z.number().min(4).max(24)`). Con 24, la finestra utile diventa
**vuota** e il programma smette di chiudere qualsiasi cosa, **in silenzio**.

---

## 4. Chi lavora in un giorno di ferie approvate lavora gratis — P1

`src/lib/attendance/payroll-calculator.ts:550-559`

```ts
if (leaveCode) {
  // Giorno di assenza
  hours = { ordinary: 0, overtime: 0, night: 0, holiday: 0, total: 0, breakMinutes: 0 }
```

Se un dipendente ha un'assenza approvata quel giorno, il calcolo **non guarda nemmeno** le sue
timbrature: il ramo delle ferie viene per primo e azzera tutto.

Situazione ordinaria in un bar: Luca è in permesso, il collega dà forfait, Luca viene chiamato e
copre sei ore. Timbra regolarmente. Nel cartellino quel giorno risulta **0 ore**, e nessuna nota
segnala la contraddizione.

Il dettaglio che rende la cosa peggiore: le colonne di entrata e uscita del cartellino ripiegano
sulle timbrature vere (righe 623-652). Il documento quindi mostra **«entrata 17:00, uscita 23:00,
ore 0»**. Sei ore di lavoro, 72 € lordi, e il foglio che dovrebbe far scoprire l'errore mostra
l'orario giusto accanto al totale sbagliato.

**Rimedio proposto.** Quando in un giorno coesistono un'assenza approvata e delle timbrature,
calcolare comunque le ore e aggiungere un avviso esplicito («giornata con permesso e timbrature:
da verificare») nell'elenco dei `warnings` che l'export già mostra. La decisione su quale dei due
vince spetta al titolare e al consulente, ma il sistema non deve scegliere in silenzio.

---

## 5. Il dipendente cessato a metà mese sparisce con le sue ore — P1

`src/lib/attendance/payroll-calculator.ts:256-259`

```ts
const usersWhere: Prisma.UserWhereInput = {
  isActive: true,
  portalEnabled: true,
}
```

L'export paghe considera solo i dipendenti **attivi in questo momento**, senza nessun criterio di
data. Chi viene disattivato il giorno 15 **non compare nell'export di quel mese**, comprese le due
settimane che ha lavorato prima di andarsene. Non compare con una riga a zero: non compare
affatto, quindi la sua assenza dall'elenco non salta all'occhio.

Su due settimane a tempo pieno sono circa **80 ore, 960 € lordi** che non arrivano al consulente.
Ed è proprio l'ultimo mese, quello in cui si fa il conguaglio e in cui un errore diventa una
vertenza.

Vale identicamente per `portalEnabled: false`, che è la casella che si toglie a chi non deve più
accedere all'applicazione — un gesto che sembra innocuo e invece cancella le ore dal mese.

Le timbrature vengono caricate **senza** filtro sull'utente (riga 349): il sistema ha i dati, li ha
già in memoria, e li scarta.

**Rimedio proposto.** Includere nell'export chiunque abbia almeno una timbratura o un'assenza nel
mese, indipendentemente da `isActive` e `portalEnabled`, marcando eventualmente la riga come
«cessato». In alternativa minima: contare le timbrature degli utenti esclusi e alzare un avviso
(«ci sono timbrature di 1 persona non inclusa nell'export»), che è una riga di codice e impedisce
il caso peggiore.

---

## 6. Le ore scritte per sbaglio non si possono correggere dall'applicazione — P1

Non esiste **nessuna** funzione per modificare o cancellare una timbratura: in tutte le route
dell'interfaccia non c'è un solo `attendanceRecord.update` o `delete`. La scelta è difendibile —
lo storico delle timbrature è a sola aggiunta, ed è giusto così.

Il problema è che **anche il rimedio previsto non funziona**. Se il sistema ha scritto l'uscita
sbagliata alle 18:58 e si aggiunge a mano quella giusta alle 13:05, il motore tiene comunque **la
più tarda**, per via dello stesso codice del difetto 1 (`timekeeping-engine.ts:171-174`: `Math.max`
sulla fine del turno). E risolvere l'anomalia non aiuta: `anomalies/[id]/resolve/route.ts:69-72`
cambia solo lo stato della segnalazione, non tocca l'orario.

**Conseguenza pratica:** una volta che il sistema ha scritto 12 ore, quelle 12 ore si tolgono
**solo entrando nel database**. Nessuno in azienda può correggerle dall'applicazione.

**Rimedio proposto.** Non serve un pulsante «cancella timbratura». Basta molto meno: una funzione
di **rettifica** che scriva una correzione tracciata (chi, quando, perché) che il motore rispetti
al posto dell'orario originale. È lo stesso schema della nota di credito in contabilità, che questo
gestionale già conosce.

---

# I difetti che non valgono soldi ma vanno chiusi

## 7. Le ore sospese senza niente da approvare — P2

Con le regole che seguono il turno pianificato, i minuti oltre la fine restano **sospesi** in
attesa che un responsabile decida (`timekeeping-engine.ts:352-356`). È un meccanismo giusto.

Ma la chiusura automatica scrive l'uscita con una scrittura diretta sul database e **salta**
`createManualPunch`, che è l'unico punto in cui nasce l'anomalia da approvare
(`manual-punch.ts:151-160`). Risultato: quasi sei ore restano «né pagate né perse», **senza nulla
che compaia da nessuna parte da approvare**. E il blocco dell'export non scatta, perché guarda solo
i due tipi di anomalia che qui non vengono creati (`export/payroll/route.ts:59-88`).

Ore che spariscono dal cedolino senza che nessuno abbia deciso di toglierle.

## 8. La pausa aperta e mai richiusa viene pagata — P2

`timekeeping-engine.ts:175-182`: se arriva `BREAK_START` e non arriva mai `BREAK_END`, la pausa non
viene registrata e **non viene dedotta**. Verificato eseguendo il motore:

```
IN 09:00, BREAK_START 13:00 (mai chiusa), OUT 18:00 → 9,00 h, pause dedotte 0, avvisi: []
IN 09:00, BREAK_START 13:00, BREAK_END 14:00, OUT 18:00 → 8,00 h, pause dedotte 60
```

Un'ora regalata, che per giunta finisce tutta in straordinario. Il danno si materializza solo sulle
regole senza pausa pranzo configurata (con la pausa pranzo, la regola la deduce comunque) — cioè
**proprio i turni serali del bar**, dove le pause sono lunghe e dimenticarsi di richiudere è la
norma. Nessun avviso.

## 9. La posizione GPS dei colleghi è leggibile da chiunque — P2

`src/app/api/attendance/anomalies/[id]/route.ts:12-21`. Verificato leggendo il file: la funzione di
lettura del dettaglio di una segnalazione controlla **solo** che l'utente sia autenticato. Nessun
controllo di ruolo, nessun controllo che la segnalazione riguardi chi la sta leggendo. Restituisce
nome, cognome, **email**, e della timbratura `latitude`, `longitude`, `distanceFromVenue` e
`deviceInfo`: la **posizione esatta e il modello di telefono** di un collega.

Il confronto è impietoso: la funzione di modifica sulla stessa route il controllo ce l'ha (riga
111, admin e manager), e quella di risoluzione verifica anche la sede. Solo la lettura è stata
dimenticata.

Oggi è mitigato dal fatto che l'identificativo è una stringa non indovinabile e che nessuna
schermata accessibile allo staff mostra gli identificativi delle segnalazioni altrui. Ma la
protezione è **l'imprevedibilità di una stringa, non una decisione di autorizzazione**: il giorno
in cui un identificativo finisce in un log o in uno screenshot, diventa P1. Trattandosi di
geolocalizzazione di lavoratori, è anche una questione di dato personale.

**Rimedio:** una riga, il controllo di ruolo su admin e manager.

## 10. Un dipendente può fissare l'orario di uscita di un collega — P2

`src/app/api/attendance/timbrature-aperte/route.ts:84` ammette anche il ruolo `staff`, e alla riga
149 l'uscita viene creata **per l'utente indicato nella richiesta**, all'orario indicato nella
richiesta.

La scelta è deliberata e ben documentata: è lo staff a fare la chiusura di cassa la sera, e chi
chiude deve poter confermare le uscite di chi ha già smesso. I paletti ci sono e sono seri — si può
chiudere solo chi risulta davvero dentro, l'uscita non può precedere l'entrata né stare nel futuro,
tutto finisce nel registro delle modifiche, e le ore oltre il turno restano da approvare.

Ma dentro quei paletti, **chiunque può abbassare l'orario di uscita di un collega**. Marco esce
alle 23:40; chi fa la cassa dichiara la sua uscita alle 22:00; Marco perde **1 ora e 40** e lo
scopre a fine mese, se legge il cartellino.

**Rimedio proposto:** non togliere il permesso, che serve al lavoro reale, ma **avvisare
l'interessato**: una notifica «la tua uscita del 5 agosto è stata registrata alle 22:00 da Anna».
Il canale di notifica push esiste già ed è funzionante.

## 11. La timbratura scritta dal sistema è indistinguibile da una vera — P2

`auto-clockout/route.ts:93` scrive `punchMethod: 'WEB'`, cioè lo stesso valore di una timbratura
fatta dal dipendente col telefono (quelle inserite a mano da un umano usano `MANUAL`). Nella scheda
del dipendente il campo `isManual` viene sì scaricato (`AttendanceTab.tsx:21`) ma **non viene mai
mostrato**: nel calendario compare solo l'orario.

Il titolare non ha modo, guardando la scheda, di sapere quale orario è reale e quale l'ha inventato
il sistema.

## 12. La garanzia sui mesi già chiusi tiene, ma solo se ci si ricorda di usarla — P2

La storicizzazione delle regole d'orario **funziona**, e l'ho verificata sulla logica: quando si
modifica una regola indicando una data di decorrenza, i valori precedenti vengono congelati
(`politiche-orario/[id]/route.ts:101-128`), il calcolo mensile chiede sempre la versione valida
**per quel giorno** (`payroll-calculator.ts:511-519`), e il meccanismo regge anche con più
modifiche successive. Cinque test lo dimostrano. È fatto bene.

Il punto debole è che **la data di decorrenza è facoltativa**. Il codice lo dichiara apertamente
(`politiche-orario/[id]/route.ts:12-16`): senza decorrenza la modifica vale anche per il passato,
«utile per correggere un errore di battitura». Ma non c'è nessun avviso e nessun blocco: un manager
che corregge la pausa pranzo e non compila quel campo **riscrive tutti i cartellini già consegnati
al consulente**, e non lo scopre nessuno.

Manca anche la prova d'insieme: nessun test verifica che il congelamento scatti davvero al momento
del salvataggio. Se quel pezzo smettesse di funzionare, i cinque test resterebbero verdi e i mesi
chiusi cambierebbero in silenzio.

**Rimedio proposto:** rendere la decorrenza obbligatoria per impostazione predefinita (proponendo
la data di oggi), e richiedere una conferma esplicita per applicare la modifica al passato, con
scritto quanti mesi ne sarebbero toccati.

## 13. Il controllo degli accessi è riscritto a mano 39 volte — P2

Nel perimetro presenze ci sono **39 route** e **nessuna** usa `withAuth`, l'involucro introdotto in
W3 proprio per centralizzare il controllo (verificato: `grep -rln withAuth` sul perimetro dà zero).
Ognuna riscrive il controllo per conto proprio, in almeno cinque forme diverse.

Il commento di `withAuth` stesso (`src/lib/api-utils.ts:172-175`) dice che quella ripetizione «è la
causa dei buchi trovati dall'audit di agosto 2026, perché il controllo di ruolo veniva
dimenticato». È esattamente ciò che è successo al difetto 9. Non è un problema di stile: è la
ragione per cui il prossimo buco nascerà.

---

# Cose minori

- **P3 — Le matricole si spostano.** `payroll-calculator.ts:484`: il codice dipendente è la
  posizione nell'elenco ordinato per cognome (`001`, `002`...). Un nuovo assunto di cognome «Abate»
  **rinumera tutti**. Se il consulente usa la matricola per abbinare le ore, il mese dopo le
  abbina alla persona sbagliata.
- **P3 — Doppio sconto del cambio d'ora.** Se una pausa timbrata cade a cavallo delle 02:00 nella
  notte del cambio, l'ora saltata viene tolta due volte (una nella pausa misurata sull'orologio,
  una nello sconto esplicito): circa un'ora persa. Succede due notti l'anno e solo con la pausa in
  quella posizione, ma su un turno notturno è possibile.
- **P3 — Ore notturne ridotte dalle pause diurne.** Le ore notturne sono calcolate in proporzione
  (`timekeeping-engine.ts:648-651`), quindi una pausa pranzo **diurna** riduce anche le ore
  notturne. Su 10 ore con 2 notturne e un'ora di pausa si perdono 12 minuti di maggiorazione
  notturna. È una scelta dichiarata nel commento, ma è denaro e conviene che il titolare la
  conosca.
- **P3 — Notturno e festivo non si sommano.** In un giorno festivo le ore notturne sono azzerate e
  contate solo come festive (`timekeeping-engine.ts:663-677`, con test esplicito). Se il contratto
  applicato prevede che le due maggiorazioni si sommino, il dato che arriva al consulente non
  permette di distinguerle. **Da chiedere al consulente del lavoro**, non è una domanda tecnica.
- **P3 — `/api/shifts/reminder` è irraggiungibile.** Non è fra le rotte pubbliche del middleware,
  quindi una chiamata senza sessione viene rediretta al login prima di arrivare al controllo del
  segreto. È codice morto: o si aggiunge, o si cancella.
- **P3 — Le ore del turno nel riepilogo sono grezze.** `manual-punch.ts:270-287` calcola
  `hoursWorked` come semplice differenza fra la prima entrata del giorno e l'uscita, senza pause né
  regole: su un turno spezzato scrive 15 ore invece di 11. Non finisce nelle paghe (che ricalcolano
  tutto dal motore), ma alimenta le schermate, che quindi non tornano con il cartellino.

---

# Quello che è fatto bene

Non è cortesia: in questo modulo la parte solida è la maggioranza.

- **Il motore di calcolo.** Puro, senza database e senza orologio, con 139 test verdi in 1,2
  secondi. Turno a cavallo della mezzanotte, cambio dell'ora in entrambe le direzioni, turno
  spezzato, arrotondamenti con tolleranza, tetto giornaliero, sabato come straordinario: tutti
  coperti da test e tutti **corretti** alla verifica.
- **Il cambio dell'ora** è gestito con precisione in tutti e due i sensi: la notte di marzo non si
  paga l'ora mai vissuta, quella di ottobre si paga l'ora vissuta due volte. L'ho ricontrollato a
  mano sui minuti.
- **Il raggruppamento per giornata lavorativa** (`workday.ts`) risolve davvero il turno serale: chi
  entra alle 21:00 ed esce all'1:00 ha lavorato una giornata sola.
- **La timbratura scrive sempre l'utente della sessione**, mai un identificativo arrivato dal
  client: timbrare l'**entrata** al posto di un altro è impossibile. Escluso con certezza.
- **L'export paghe si rifiuta di partire** se ci sono anomalie di anticipo o straordinario ancora
  da decidere: niente ore mai confermate consegnate al consulente.
- **Il cartellino ignora l'identificativo chiesto dal client** quando chi chiama è staff: ognuno
  vede il proprio, e il codice spiega perché.
- **Il portale dipendente è corretto:** i documenti verificano la proprietà prima di essere
  serviti, i turni sono solo i propri, l'elenco colleghi espone nome ed email e nient'altro
  (nessun telefono, nessun indirizzo, nessuna paga).
- **Le route del cron sono protette** da un segreto e falliscono chiuse se il segreto manca.
- **La chiusura delle timbrature aperte in cassa** è il pezzo scritto meglio: usa la fine turno
  pianificata, non si fida dell'elenco che arriva dal client, scrive uscite tracciate con registro
  delle modifiche e lascia le ore oltre il turno a una revisione umana. **È il modello a cui la
  chiusura automatica andrebbe riscritta.**
- **I promemoria** hanno una protezione seria contro le notifiche doppie, e non mandano «ricordati
  di timbrare l'entrata» alle 23:00 se il servizio è rimasto fermo.
- **Il registro delle modifiche** è scritto su ogni cambio di regola d'orario e di promemoria.

---

# Sulla copertura dei test

139 test, tutti verdi, nessuno saltato o disabilitato, nessun difetto noto lasciato aperto. La
libreria di calcolo è coperta bene.

Il vuoto è altrove: **delle 15 route sotto `attendance/`, una sola ha test** (`daily-summary`).
Senza test: `punch`, `manual`, `auto-clockout`, `export/payroll`, la risoluzione delle anomalie.
In particolare **`auto-clockout` non ha una sola riga di test** ed è il programma che *scrive ore
pagate* sul database senza che nessuno le abbia chieste. È l'unico pezzo che tocca il denaro senza
rete.

Casi limite non coperti, in ordine di pericolosità: l'uscita tardiva dopo un turno chiuso
(difetto 1), il dipendente disattivato a metà mese (difetto 5), ferie e timbrature nello stesso
giorno (difetto 4), la pausa mai richiusa (difetto 8), la chiusura automatica per intero
(difetti 2, 3, 7).

---

# Cosa suggerisco di fare, in ordine

1. **Eseguire la query del difetto 3** per contare le timbrature rimaste aperte per sempre. È una
   lettura, non cambia niente, e dice subito quanto è grande l'arretrato.
2. **Difetto 1** — il limite di distanza sull'uscita doppia. È il difetto più caro e la correzione
   è circoscritta a quattro righe del motore, che è la parte meglio testata del sistema.
3. **Difetti 4 e 5** — ferie con timbrature, e dipendente cessato. Sono due condizioni nel
   calcolatore delle paghe, e sono gli unici due difetti che tolgono soldi **al dipendente**.
4. **Difetti 2, 3, 7** — riscrivere la chiusura automatica sul modello della chiusura di cassa, che
   funziona già. Un lavoro solo, che ne chiude tre.
5. **Difetto 9** — il controllo di ruolo mancante: una riga.
6. **Difetto 12** — rendere obbligatoria la data di decorrenza.

I difetti 1, 4, 5 e 8 hanno una caratteristica in comune che vale più della loro somma: **il
sistema non dice mai che sta sbagliando**. La lista degli avvisi esce vuota, il cartellino sembra
in ordine, l'export non si blocca. Se dovessi correggere una cosa sola oltre ai numeri, farei in
modo che ognuna di queste situazioni alzi un avviso — anche prima di cambiare il calcolo, perché un
numero sbagliato che si vede costa molto meno di un numero sbagliato che non si vede.

---

## Cosa non ho verificato

- Non ho eseguito niente contro il database di produzione, quindi **non so quante timbrature aperte
  ci siano davvero** né se la riga delle impostazioni presenze esista (se non esiste, i controlli
  sulla posizione sono spenti senza che nessuna schermata lo dica: va verificato con
  `SELECT count(*) FROM attendance_policies;`).
- Il funzionamento del cron su Railway l'ho dato per assodato come indicato: ho esaminato **cosa fa
  quando gira**, non **se** gira.
- Non ho provato l'interfaccia con un browser: i difetti sull'interfaccia (11) vengono dalla lettura
  dei componenti.
- La geolocalizzazione è aggirabile perché le coordinate le manda il telefono, e l'applicazione
  stessa fornisce a ogni dipendente le coordinate della sede. Il controllo lato server esiste ed è
  scritto bene, ma **la timbratura «in sede» non prova la presenza in sede**: se il titolare
  intende usarla per contestare delle ore, conviene che lo sappia prima.
