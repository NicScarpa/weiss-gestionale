# Import fatture: due controlli di plausibilità sul documento in ingresso

`DOC-11` · impatto 3 · effort **S** · quick win #14

## Contesto

L'import delle fatture elettroniche deduplica su `sdiId` (unique) e non controlla
nient'altro. Una fattura intestata a un altro soggetto, o con una data
palesemente sbagliata, entra e concorre ai totali senza che nulla lo segnali.

Il dato per accorgersene c'è: l'XML SDI contiene la partita IVA del cessionario.

## Cosa fa (male) Trezy

Due difetti osservati sullo stesso archivio, entrambi evitabili con controlli
banali:

1. **Una fattura intestata a un soggetto terzo** è accettata e conteggiata: *«Il
   sistema non solleva alcun avviso. Non esiste un controllo che confronti il
   destinatario estratto con l'identità dell'organizzazione titolare — controllo
   che sarebbe banale avendo la partita IVA. Su un'area il cui KPI principale è
   un'esposizione debitoria, ammettere silenziosamente documenti altrui è un
   difetto di igiene del dato, non un dettaglio.»*

2. **Una data documento a quattro mesi nel futuro** è accettata senza obiezioni,
   e manda in tilt la colonna «ultima attività», che finisce per dire «tra 5
   mesi» — una contraddizione nei termini. *«Un controllo di plausibilità sulle
   date è il più economico dei controlli e qui non c'è.»*

## Cosa fare

Due controlli **non bloccanti**, che marcano il documento invece di rifiutarlo.

1. **Destinatario** — confrontare la partita IVA del cessionario nell'XML con
   quella di WEISS. Se non coincide: `notes` (o un flag) «destinatario non
   riconosciuto» e badge in lista.
2. **Data** — se `invoiceDate` è nel futuro, o più vecchia di N anni
   (suggerito: 3), stesso trattamento.

La scelta di **non bloccare** è deliberata e va scritta nel codice: un falso
positivo che impedisce di caricare una fattura costa più dell'avviso che si
ignora. Casi legittimi esistono — la fattura del fornitore intestata alla sede,
il documento con data di fine mese caricato in anticipo.

## Criteri di accettazione

- [ ] Una fattura con P.IVA cessionario diversa da quella di WEISS viene
      **importata** e marcata.
- [ ] Il badge è visibile nella lista fatture, non solo nel dettaglio.
- [ ] Una fattura con data futura viene importata e marcata.
- [ ] Una fattura regolare non porta alcun marcatore.
- [ ] Nessun import esistente viene rifiutato dalla modifica (verificare su un
      campione di XML reali già importati).
- [ ] La P.IVA di WEISS non è cablata nel codice: si legge dalle impostazioni
      dell'azienda.

## File coinvolti

- `src/lib/sdi/parser.ts` (estrazione della P.IVA cessionario, se non già
  presente)
- `src/app/api/invoices/route.ts` o `src/app/api/invoices/parse/route.ts`
- `src/components/invoices/InvoiceList.tsx`

## Evidenza

- `docs/trezy/02-aree-funzionali/02-02-documenti-scadenzario-riconciliazione.md`
  §8.3, §9.2, §13.6
