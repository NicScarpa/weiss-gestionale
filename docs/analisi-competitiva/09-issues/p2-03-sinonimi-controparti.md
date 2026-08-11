# Riconciliazione: dizionario dei sinonimi delle controparti

`CLS-12` · impatto 4 · effort M

## Contesto

Il fattore «descrizione» del punteggio di match pesa il 20% e si basa su
`stringSimilarity` (Levenshtein + contenimento). Funziona quando i nomi si
somigliano; non funziona nel caso che è la ragione stessa per cui la
riconciliazione bancaria è difficile: **la banca scrive «GREEN ENERGY COOP SOC
COOP A RL» e l'anagrafica ha «Green Energy Coop»**, e nessun confronto letterale
li unisce.

L'analisi del nostro matcher lo registra già come evidenza: nei match automatici
reali di Sibill *«un bonifico intestato a "ESTENERGY" può saldare una fattura
"HERA"»*, motivo per cui l'importo pesa il 55% e la descrizione solo il 20%. Un
dizionario di sinonimi è ciò che rende quel 20% utile invece che rumore.

`GET /api/payee-suggestions` **non** risolve questo: autocompleta il campo
«Pagato a» delle uscite di cassa unendo fornitori attivi e beneficiari storici. È
un'altra cosa e va tenuta separata.

## Cosa fa Cash King

`/synonyms` — «Gestisci i sinonimi per clienti e fornitori, e i sinonimi
scartati»:

| Aspetto | Comportamento |
|---|---|
| Uso | riconoscimento della controparte in importazione e riconciliazione |
| Corrispondenza | **anche parziale** |
| Creazione | manuale, **oppure automatica** approvando un abbinamento o unendo due anagrafiche |
| Cestino | i sinonimi scartati stanno in un tab dedicato e sono ripristinabili |
| Colonna **Origine** | filtrabile: dice da dove viene ciascun sinonimo |

Il punto che l'analisi isola come decisivo: *«i sinonimi si accumulano da soli.
L'utente non deve sedersi a compilare un dizionario: lo costruisce come effetto
collaterale del lavoro che stava già facendo. È il modo più economico di
imparare.»*

E sul cestino: *«un sinonimo sbagliato è peggio di un sinonimo assente:
attribuisce silenziosamente movimenti alla controparte sbagliata.»*

Un'osservazione che ridimensiona l'aspettativa e va tenuta presente: sul dataset
dimostrativo con 21 clienti e 49 movimenti il dizionario è **vuoto**. *«I sinonimi
non vengono precaricati: nascono solo dall'uso. Un cliente nuovo parte quindi con
il fattore controparte al minimo della sua efficacia.»*

## Cosa fare

1. **Modello `CounterpartySynonym`**:
   - `venueId`, `supplierId` **oppure** `customerId` (uno dei due),
     `testo` (come appare nel tracciato), `testoNormalizzato` (minuscolo, senza
     forme societarie e punteggiatura), `origine`
     (`MANUALE` / `RICONCILIAZIONE` / `UNIONE`), `trashedAt`, `createdById`.
   - Indice su `[venueId, testoNormalizzato]`.
2. **Uso nel matcher** — `src/lib/reconciliation/schedule-matcher.ts`: prima di
   `stringSimilarity`, cercare una corrispondenza esatta o parziale nel
   dizionario. Se c'è, il fattore descrizione va al massimo e la motivazione
   diventa «Controparte riconosciuta» (si incastra con `RIC-03`).
3. **Accumulo automatico** — all'approvazione di una riconciliazione in cui il
   nome della controparte del movimento differisce da quello della scadenza,
   proporre il salvataggio del sinonimo. **Proporre**, non salvare: un sinonimo
   sbagliato è peggio di uno assente.
4. **Pagina di gestione** con i due tab (attivi / cestinati), filtro per origine e
   ripristino.
5. **Normalizzazione**: rimuovere `S.R.L.`, `SPA`, `SOC COOP`, `A R.L.` e
   simili — è la parte che fa il grosso del lavoro sui tracciati italiani.

## Criteri di accettazione

- [ ] Un sinonimo salvato fa salire il punteggio di match sulle riconciliazioni
      successive.
- [ ] Approvando un abbinamento con nomi diversi, il sistema **propone** il
      sinonimo e non lo impone.
- [ ] Il cestino conserva il sinonimo e permette il ripristino.
- [ ] La colonna origine è valorizzata e filtrabile.
- [ ] La normalizzazione riconosce «GREEN ENERGY COOP SOC COOP A RL» e «Green
      Energy Coop» come lo stesso soggetto (test esplicito).
- [ ] Un sinonimo non può puntare contemporaneamente a un fornitore e a un
      cliente.

## Aspettativa realistica

Il dizionario parte vuoto e migliora col tempo. Il beneficio non si vede il primo
giorno: si vede dopo qualche decina di riconciliazioni. Vale la pena scriverlo
nel ticket perché è il motivo per cui una funzione così finisce abbandonata.

## File coinvolti

- `prisma/schema.prisma` + migrazione
- `src/lib/reconciliation/schedule-matcher.ts`
- `src/lib/reconciliation/normalizza-controparte.ts` (nuovo, puro, testato)
- `src/lib/services/schedule-reconciliation-service.ts` (proposta all'approvazione)
- `src/app/api/sinonimi/`
- `src/app/(dashboard)/anagrafiche/sinonimi/`

## Evidenza

- `docs/cashking/02-aree-funzionali/02-05-regole-e-sinonimi.md` §2, §3
- `docs/cashking/02-aree-funzionali/02-06-stampe-import-pianificazione.md` §6.3
- Screenshot: `assets/cashking/screenshots/17-suggerimento-sinonimo-nome-vuoto.png`
- Nostra evidenza sui pesi: `src/lib/reconciliation/schedule-matcher.ts:4-20`
