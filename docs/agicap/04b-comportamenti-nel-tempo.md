# Comportamenti nel tempo — osservazione longitudinale

L'accesso scade il **18 agosto 2026**. La finestra utile è quindi di **7 giorni**,
contro i 20 che il metodo assume: l'osservazione non può essere una fase a sé,
deve girare in parallelo a tutto il resto a partire da oggi.

**Vincolo che la definisce:** ambiente di **produzione**, sola lettura. Non
predisponiamo condizioni artificiali — niente scadenze finte per far scattare un
alert, niente soglie configurate per vedere l'avviso. Si osserva **solo ciò che
matura da sé** sui dati reali. Dove servirebbe una scrittura per vedere un
comportamento, il comportamento resta non osservabile e va dichiarato tale.

---

## Fotografia di partenza — 11 agosto 2026, ore 15:00

`[OSSERVATO]` Valori registrati per il confronto nei giorni successivi. Gli
importi sono arrotondati e i conti anonimizzati: la precisione serve al
confronto, non alla contabilità.

| Grandezza | Valore all'11/08 |
|---|---|
| Conti bancari collegati | **4** (di cui 3 a saldo zero, 1 attivo) |
| Saldo bancario totale | ~7,8 k€ |
| Finanziamenti disponibili | 0,00 € |
| Transazioni da categorizzare (ultimi 60 gg) | **228** |
| Tasso di categorizzazione (ultimi 15 gg) | **0%** |
| Regole di categorizzazione suggerite | **66** |
| Regole di categorizzazione attive | 0 |
| Transazioni «In attesa» | **0** |
| Previsione oltre il mese corrente | **piatta**: il saldo resta costante su tutti i mesi futuri |
| Notifiche in-app non lette (widget novità) | 1 |
| Periodo di default del Piano di tesoreria | maggio 2026 → ottobre 2027 (18 mesi) |
| Periodo di default della Situazione di cassa | S29 (13/07) → S46 (15/11) |

---

## Le domande dell'osservazione

Da riverificare a ogni rientro, confrontando con la tabella qui sopra.

**1. Le previsioni si ricalcolano da sole?**
Oggi la curva prevista è piatta: il saldo di fine agosto viene riportato
identico su tutti i mesi successivi. Se fra qualche giorno resta piatta *allo
stesso valore*, il previsionale è uno snapshot congelato che dipende da dati che
noi non abbiamo (flussi attesi, ricorrenze). Se il valore si sposta seguendo il
saldo reale, c'è un ricalcolo automatico.
**Questa è la domanda più importante del capitolo.**

**2. La finestra temporale è rolling o fissa?**
Il Piano di tesoreria si apre su maggio 2026 → ottobre 2027, la Situazione di
cassa su S29 → S46. Se fra una settimana gli estremi si sono spostati in avanti,
la finestra è mobile e ancorata a oggi; se sono gli stessi, è fissa.

**3. Il conteggio «228 da categorizzare negli ultimi 60 giorni» come si muove?**
È dichiarato su una finestra mobile di 60 giorni. Se il numero cresce di pari
passo con i nuovi movimenti bancari, la finestra scorre davvero.

**4. I 66 suggerimenti di regole cambiano?**
Sono generati analizzando le causali. Con nuovi movimenti in arrivo, il numero e
il contenuto dei suggerimenti dovrebbero evolvere. Se restano identici, il
calcolo è periodico o congelato.

**5. Arrivano notifiche, email o digest?**
Nessun alert risulta configurato e **non ne configureremo** (sarebbe una
scrittura). Si osserva solo cosa arriva spontaneamente: notifiche in-app, badge,
email all'indirizzo dell'account, riepiloghi periodici.

**6. Compaiono nuovi banner, suggerimenti o funzionalità?**
Il prodotto mostra banner contestuali («New») e inviti all'azione. Vale la pena
annotare quando cambiano: raccontano come guidano l'utente nel tempo.

---

## Predisposizioni attive (autorizzate dall'utente l'11 agosto)

L'utente ha autorizzato la scrittura sull'ambiente, purché senza effetti fuori da
Agicap. Sono quindi state predisposte due condizioni che rendono osservabili
comportamenti altrimenti invisibili.

### 1. Soglia di liquidità bassa — **attiva**

Conto operativo impostato su tipo «Conti correnti», soglia **Liquidità bassa a
10.000 €** contro un saldo di ~7,8 k€. L'avviso è quindi **già scattato**: celle
arancioni su tutti i periodi sotto soglia. Da osservare nei prossimi giorni: se
allo scattare della soglia corrisponda anche una **notifica** (in-app, email,
digest) o solo la colorazione nella tabella.

### 2. Congelamento settimanale del previsionale — **attivo**

*Impostazioni → Analisi degli scostamenti → Bloccare il previsionale*:
«Bloccare automaticamente ogni settimana i dati previsionali», attivato l'11
agosto. Configurazione risultante:

| Parametro | Valore |
|---|---|
| Giorno della settimana | lunedì |
| Ora | 13:00 («ora a partire dalla quale i dati **possono** essere congelati») |
| Fuso orario | **Europe/Paris** (predefinito, su un account italiano) |
| Ultimi dati congelati | — (nessuno all'attivazione) |

**Perché conta.** È il meccanismo con cui il prodotto costruisce lo **storico
delle previsioni**: uno snapshot settimanale congelato, da confrontare poi con il
consuntivo. Senza di esso l'analisi degli scostamenti non ha un termine di
paragone.

**Finestra di osservazione:** il primo congelamento è atteso **lunedì 17 agosto
alle 13:00**, e l'accesso scade il **18**. Si potrà quindi osservare
**esattamente un ciclo** — sufficiente per stabilire se il meccanismo funziona,
insufficiente per vedere una serie storica.

Da verificare il 17-18 agosto:
- il campo «Ultimi dati congelati» si popola?
- l'analisi degli scostamenti diventa consultabile e con quali colonne?
- lo scostamento è calcolato in valore assoluto, in percentuale, o entrambi?
- distingue l'origine dello scarto (transazioni in attesa vs stime settimanali),
  come promette la pagina di presentazione?

### Nota su un percorso interrotto

`[OSSERVATO]` Il pulsante **«Attivare l'analisi degli scostamenti»**, nella
pagina di presentazione del modulo, apre una nuova scheda che **rimbalza sulla
home** senza attivare nulla. L'attivazione reale si trova solo navigando a mano
in *Impostazioni → Analisi degli scostamenti → Bloccare il previsionale*. È un
percorso di attivazione rotto sulla call-to-action principale della funzione.

---

## Il capitolo che resterà chiuso, e perché

`[NON OSSERVABILE — richiederebbe una scrittura in produzione]`

- **Soglie di avviso sui conti.** La Situazione di cassa propone esplicitamente
  di «identificare i conti correnti e definire le soglie di avviso». Esiste
  quindi un meccanismo di allerta sul saldo, ma vederlo scattare richiede di
  configurarlo. Non lo facciamo.
- **Alert su scadenze in avvicinamento**: richiederebbe di creare scadenze.
- **Report schedulati e riepiloghi periodici**: richiederebbero di attivarli.
- **Confronto previsto/consuntivo nel tempo**: richiederebbe che esistesse un
  previsionale popolato, che con 0 transazioni attese non c'è.

Se l'utente volesse aprire uno di questi capitoli, la richiesta va fatta a lui e
la scrittura eseguita da lui o con il suo assenso esplicito, caso per caso.

---

## Registro delle osservazioni

| Data | Cosa è cambiato rispetto alla fotografia iniziale |
|---|---|
| 11/08 | — (fotografia di partenza) |
