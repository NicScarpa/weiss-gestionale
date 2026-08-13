# Logiche di calcolo

Verifiche svolte nel prodotto l'**11 agosto 2026**, account WEISS.

**Nota sul metodo.** L'utente ha autorizzato la scrittura sull'ambiente. Le
verifiche sotto sono state fatte **immettendo input noti** (stime settimanali
caricate da me con valori scelti) e confrontando l'output dell'applicazione con
il calcolo atteso. È l'unico modo per stabilire una formula invece di ipotizzarla.

I valori di stima usati sono **inventati** e scelti per essere riconoscibili nei
risultati; i saldi di partenza sono invece reali.

---

## Limiti di verificabilità

Prima dei risultati, cosa **non** è stato possibile stabilire e perché.

| Ambito | Stato | Motivo |
|---|---|---|
| Previsione a medio-lungo termine (12+ mesi, con AI) | `[NON ACCESSIBILE]` | modulo venduto separatamente |
| Riconciliazione bancaria | `[NON ACCESSIBILE]` | modulo `treasury_bank_journal` non incluso |
| DSO / DPO | `[NON POPOLATO]` | richiede fatture e anagrafiche clienti, assenti |
| Scostamento previsto/consuntivo su serie storica | `[NON VERIFICABILE oggi]` | le stime sono state inserite oggi: non esiste ancora uno storico di previsioni da confrontare |
| Categorizzazione automatica (AI) | `[NON VERIFICABILE]` | le regole applicate sono deterministiche; il contributo dell'AI non è isolabile |

---

## 1. Il modello delle stime settimanali — **verificato**

### Come si alimenta la previsione

`[OSSERVATO]` La previsione a 13 settimane **non si genera dallo storico**.
Categorizzare 146 movimenti passati ha popolato il consuntivo e lasciato la
previsione futura perfettamente vuota, col saldo piatto.

L'unica fonte di stime offerta dal nostro piano è **il caricamento di un foglio
Excel** (`Completare le stime a 13 settimane → Foglio Excel`). Non esiste, in
questo piano, una generazione automatica per media storica o ricorrenza.

### La formula della settimana in corso — **verificata numericamente**

Questa è la scoperta più importante del capitolo.

Input noto: stima settimanale caricata per la categoria degli incassi = **15.000 €**
Consuntivo già realizzato nella settimana in corso = **6.260,30 €**

Output dell'applicazione, colonna della settimana corrente, divisa in due:

| Colonna | Valore mostrato |
|---|---|
| **Ad oggi** | 6.260,30 € |
| **Fine della settimana** | **8.739,70 €** |

`15.000 − 6.260,30 = 8.739,70` — **coincide al centesimo**.

> **«Fine della settimana» non è il totale previsto: è il residuo ancora atteso.**

La stima **non si somma** al consuntivo, viene **assorbita** da esso: ogni
movimento reale che arriva erode la stima della sua settimana invece di
aggiungersi. È la risposta al problema del doppio conteggio fra previsto e
realizzato, ed è una scelta di modello tutt'altro che ovvia.

**Perché ci riguarda.** È il problema che abbiamo identico: quando un incasso
previsto si realizza, il previsionale deve smettere di prevederlo. Qui la
soluzione è elegante perché non richiede di «consumare» esplicitamente una
previsione: la stima è un *tetto di periodo*, il consuntivo lo riempie, e la
differenza è ciò che resta da attendersi.

### Il concatenamento dei saldi — **verificato**

```
Saldo apertura settimana N+1  =  Saldo apertura N  +  entrate residue N  −  uscite N
```

Verifica con i valori dell'account:

| Grandezza | Valore |
|---|---|
| Saldo fine settimana S33 | 7.781,31 € |
| Entrate residue attese S33 | 8.739,70 € |
| Uscite stimate S33 (SDD 1.200 + affitto 3.200) | −4.400,00 € |
| **Saldo atteso apertura S34** | **12.121,01 €** |
| Saldo apertura S34 mostrato dall'applicazione | **12.121,01 €** |

Coincide. `7.781,31 + 8.739,70 − 4.400,00 = 12.121,01`.

---

## 2. Il giorno di stima — dove cade il flusso dentro la settimana

`[OSSERVATO]` In *Impostazioni → Situazione di cassa → Regole di stima
settimanale*, **ogni categoria ha un «giorno di stima»**: nell'account, tutte le
categorie di entrata sono impostate su **venerdì**, i pagamenti a fornitori (SDD,
bonifici, RIBA) su **lunedì**.

`[DEDOTTO]` Serve a distribuire una stima settimanale su un giorno preciso quando
la si guarda a maglia giornaliera. Non cambia il totale della settimana, cambia
**quando** dentro la settimana il saldo si muove — e quindi se un minimo
infrasettimanale scende sotto zero.

È un accorgimento intelligente: riconosce che una previsione settimanale è
ambigua a livello giornaliero, e risolve l'ambiguità con un default per categoria
invece di chiedere all'utente una data per ogni stima.

---

## 3. Soglie di allerta sulla liquidità — **verificato**

`[OSSERVATO]` In *Impostazioni → Tipi e soglie*, dopo aver assegnato a un conto
il tipo **«Conti correnti»**, compaiono tre soglie configurabili:

| Soglia | Significato |
|---|---|
| **Scoperto autorizzato** | fido disponibile, sommato ai saldi nella vista «liquidità effettivamente disponibile» |
| **Liquidità bassa** | sotto questo valore il saldo viene segnalato |
| **Eccedenza di liquidità** | sopra questo valore, liquidità ferma da impiegare |

Test svolto: soglia «Liquidità bassa» impostata a **10.000 €** su un conto con
saldo **7.781 €**.

**Risultato:** ogni cella di periodo in cui il saldo previsto sta sotto la soglia
viene marcata con **pallino e importo arancioni**. L'avviso è **per conto e per
periodo**, non un banner globale: si vede **da quale settimana** si scenderà sotto
soglia, non solo che si è sotto adesso. Il totale aggregato resta neutro.

Il modello a **tre** soglie merita attenzione: segnalano anche il denaro fermo in
eccesso, non solo quello che manca.

---

## 4. Difetti osservati nell'import

Tre osservazioni sulla qualità dell'importazione, tutte `[OSSERVATO]`.

**1. Il primo messaggio d'errore è cieco.** Un file XLSX rigenerato da una
libreria (openpyxl), valido per Excel ma privo di `sharedStrings.xml`, viene
rifiutato con: «Impossibile importare il file. Verificare che rispetti il formato
del modello e riprovare.» Nessuna indicazione di cosa non vada. Il parser è
rigido sulla forma del file, ma non lo dice.

**2. La diagnostica semantica invece è buona.** Superato il vaglio del formato,
gli errori diventano precisi: «Impossibile trovare la categoria "…". La stima per
questa riga è stata ignorata. **Riga 20**», con conteggio complessivo
(«47 stime su 49 sono state importate»). Riga, causa, ed esito parziale: qui
fanno le cose bene.

**3. Il modello che generano contiene righe che il loro stesso parser rifiuta.**
Due righe presenti nel file scaricato da Agicap — `Fornitori Italia > Bonifici` e
`Fornitori Estero` — vengono respinte con «impossibile trovare la categoria».
È un difetto reale: l'export e l'import non concordano sullo stesso piano dei
conti.

**Un accorgimento buono da rubare:** l'interruttore **«Compilare solo le settimane
vuote»**, attivo per impostazione predefinita. Un'importazione di massa che per
default **non sovrascrive** il lavoro già fatto a mano.

---

## 5. Cosa resta da verificare

- La formula degli **scostamenti** (`Analisi degli scostamenti`): ora che esistono
  sia previsione sia consuntivo, è verificabile.
- Il **«Riequilibrio automatico»**: funzione con icona AI, ancora inesplorata.
- Il comportamento delle stime **quando la settimana si chiude**: la stima
  residua non realizzata viene persa, riportata o segnalata come scostamento?
  È osservabile solo con il passare dei giorni → confluisce
  in `04b-comportamenti-nel-tempo.md`.
