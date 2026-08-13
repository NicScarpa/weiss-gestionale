# Area funzionale — Piano delle categorie e indicatori chiave

Osservato nel prodotto l'**11 agosto 2026**, account WEISS, produzione, sola
lettura. Nulla è stato creato, rinominato o rimosso.

I nomi di singoli contratti di finanziamento e leasing presenti nell'account sono
qui **anonimizzati**; restano nei materiali grezzi, che sono fuori dal
versionamento.

---

## 1. Il piano delle categorie

Rotta: `/it/app/settings/categories/{inflow|outflow}` — due schede separate,
**Entrata** e **Uscita**. Non è un piano unico con segno: sono due alberi
distinti.

### Gerarchia

`[OSSERVATO]` L'albero è profondo **fino a quattro livelli**, e la profondità non
è uniforme fra i rami:

```
AREA OPERATIVA                          ← area (livello fisso, in maiuscolo)
  Uscite Variabili                      ← raggruppamento
    Fornitori Italia                    ← sotto-raggruppamento
      SDD · Bonifici · RIBA · Assegno   ← foglie: il MEZZO di pagamento
    Fornitori Estero
  Uscite Fisse
    Abbonamenti e Software · Utenze · Stipendi · Spese generali · Affitto
AREA FINANZIARIA
  Altre Spese Bancarie · Commissioni
  Rimborso Mutui/Finanziamenti Bancari
    <singolo finanziamento, per banca e numero di contratto>
AREA FISCALE                            ← esiste, ed è VUOTA
AREA INVESTIMENTI
  Acquisto di Impianti e Attrezzature
  Rate Leasing
    <singoli contratti di leasing, nominati uno per uno>
AREA EQUITY
  Restituzione Finanziamento Socio · Erogazione Utili
```

Sul lato entrata l'albero è più piatto (due livelli) e le foglie sono anch'esse
**mezzi di incasso**: Bonifici da Clienti Italia, RIBA Clienti Italia, Bonifici da
Clienti Estero, Assegni da Clienti Italia.

### Tre osservazioni che contano

**1. Le foglie sono mezzi di pagamento, non nature di costo.** «Fornitori Italia →
SDD / Bonifici / RIBA / Assegno» classifica *come* si paga, non *cosa* si compra.
È coerente con uno strumento di tesoreria — a chi guarda la cassa interessa il
canale e la sua tempistica — ma significa che questo piano **non risponde alla
domanda "quanto ho speso di materie prime"**. Per quello serve la contabilità.

**2. Il piano è anche un'anagrafica.** I singoli contratti di finanziamento e di
leasing compaiono come categorie foglia, uno per uno, con banca e numero. Non
esiste (in questo piano) un'entità «finanziamento» separata: il contratto *è* una
categoria. Funziona finché i contratti sono pochi.

**3. AREA FISCALE esiste ed è vuota.** Per un'azienda italiana è il buco più
vistoso del piano configurato: nessuna categoria per IVA, F24, ritenute,
imposte. Da notare che è però prevista come area, ed è un operando delle formule
dei KPI (vedi sotto). `[DA VERIFICARE]` se sia vuota per scelta di chi ha
configurato l'account o perché il modello non offre nulla di preconfigurato.

### Gestione

`[OSSERVATO]` Ricerca, selezione multipla («SELEZIONARE TUTTO» con casella),
menu «...» di azioni bulk, **riordino per trascinamento** (tooltip «Trascinare
per spostare»), «Aggiungere nuova categoria». La pseudo-categoria **«Da
categorizzare»** è di sistema, marcata con un'icona informativa.

---

## 2. Gli indicatori chiave

Rotta: `/it/app/settings/kpis/company`. Divisi in **personalizzati per l'entità**
(organizzati in gruppi, modificabili) e **predefiniti** (immutabili: «Questi
indicatori sono stati creati da Agicap e non possono essere modificati o
rimossi»).

Predefiniti osservati: *Transazioni ignorate · Transazioni su conti bancari
ignorati · Effetto cambio · Cash flow netto*.

### La tassonomia, dalla risposta dell'API

`[OSSERVATO]` La chiamata `GET /api/forecasting/v2/customkpi` restituisce 43
elementi con un campo `type`:

| `type` | Quantità | Che cosa sono |
|---|---|---|
| 3 | 5 | **gruppi** (cartelle di indicatori) |
| 2 | 30 | indicatori con **formula personalizzata** |
| 1 | 8 | indicatori di tipo semplice / riferimento |

Ogni elemento porta `id`, `name`, `isVisible`, `position` e figli annidati:
gli indicatori sono quindi **ordinabili e nascondibili singolarmente**, non solo
per gruppo.

### I cinque gruppi configurati

**Indicatori Codice della Crisi d'impresa** — `[OSSERVATO]` **la localizzazione
italiana più seria vista finora nel prodotto.** Contiene **DSCR**, **Indice di
liquidità**, **ROIC**, **Indice di Copertura degli interessi**, più cinque voci
di entrate/uscite attese a 3 mesi per area. Sono gli indici di allerta che il
Codice della Crisi d'Impresa impone agli amministratori italiani di monitorare.

**Analisi Debito** — posizione per singolo finanziamento, importo residuo da
rimborsare, **PFN** e **PFN/EBITDA**.

**Rendiconto Finanziario** — e qui sta il collegamento importante:

```
  Saldo Area OPERATIVA
  Saldo Area INVESTIMENTI
= Saldo GEST. CORRENTE
  Saldo Area FINANZIARIA
  Saldo Area FISCALE
= Saldo GEST. CARATTERISTICA
  Saldo Area EQUITY
= Cash Flow Mensile
```

**Analisi Economica** — `+ Fatture attive · − Fatture passive · − Costi extra
fatture passive · − Costo del personale · − Compensi amministratori · = EBITDA ·
= EBITDA (%) · − Imposte e Tasse (Stima)`.

**Analisi Finanziaria** — `+ Entrate · − Uscite Variabili · = MDC Finanziario ·
= MDC Finanziario (%) · − Uscite Fisse · = EBITDA FINANZIARIO · = BEP
Finanziario`.

### Le due cose da portarsi via

**Le aree del piano dei conti sono gli operandi delle formule.** «Saldo Area
OPERATIVA», «Saldo Area FISCALE» non sono etichette descrittive: sono i termini
che compongono il rendiconto finanziario. Il piano delle categorie non è una
tassonomia decorativa, è **progettato per alimentare il reporting**. Chi disegna
le aree sta già scrivendo la struttura del rendiconto — vale la pena tenerlo
presente mentre definiamo le nostre.

**La convenzione tipografica delle formule.** Gli addendi sono prefissati da `+`
e `−`, i risultati calcolati da `=`. In un elenco verticale questo rende leggibile
una cascata di calcoli senza disegnare nulla: si legge come un conto scritto a
mano. Costa zero e si replica ovunque abbiamo indicatori derivati.

---

## 3. Nota di metodo: un rischio sfiorato

Tentando di espandere un gruppo ho aperto il suo menu contestuale, che contiene
**Nascondere · Rinominare · Rimuovere** — azioni di scrittura su un ambiente di
produzione. Ho chiuso senza selezionare nulla.

Da qui in avanti, su questa applicazione: **niente click esplorativi su icone
«...» o su elementi di cui non conosco l'esito.** Dove serve conoscere una
struttura, la fonte sicura è la risposta di rete che la pagina ha già caricato —
come è stato fatto per la tassonomia dei KPI qui sopra. Leggere il traffico che
l'interfaccia genera da sé non modifica nulla e non richiede di cliccare
alla cieca.

---

## 4. Domande aperte

- Le formule dei KPI `type=2` non sono nella risposta della lista: servirebbe
  aprire il dettaglio di un indicatore. Fattibile **solo** se esiste una vista di
  sola lettura; se l'unico accesso è un editor, non si apre.
- `AREA FISCALE` vuota: scelta di configurazione o assenza di preconfigurato?
- Le categorie sono per entità o condivise fra le entità dell'organizzazione?
- Esiste un limite di profondità dell'albero?
