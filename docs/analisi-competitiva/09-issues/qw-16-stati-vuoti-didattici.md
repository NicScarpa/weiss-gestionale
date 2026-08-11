# Stati vuoti: insegnare invece di constatare

`PLT-07` · impatto 3 · effort **S** · quick win #16

## Contesto

`CashFlowSourcePanel` spiega come nasce la previsione, ed è l'unico stato vuoto
del gestionale che insegna qualcosa. Tutti gli altri constatano che non c'è
niente e offrono il pulsante per crearlo.

Il momento in cui una lista è vuota è il momento in cui l'utente sta per prendere
la decisione che condizionerà tutte le successive, e non ha ancora nulla da
perdere. È il posto più economico dove mettere la spiegazione, e sparisce da solo
quando serve meno.

## Cosa fanno loro

**Trezy**, nello stato vuoto delle regole di classificazione, insegna la regola
semantica più difficile del sistema — la risoluzione dei conflitti fra regole
sovrapposte — con un caso concreto invece che con una definizione astratta:

> *Trascina le regole per cambiare la priorità. Le regole in alto vengono
> applicate per prime.*
> *Esempio: per le transazioni «Stipendio Matthieu» e «Stipendio Jean», se la
> regola «Matthieu» è sopra la regola «Stipendio», «Stipendio Matthieu»
> corrisponderà prima a «Matthieu».*

*«Chi legge quelle due righe prima di scrivere la prima regola ha già capito
perché l'ordine conta, e in che direzione ordinare: dal particolare al
generale.»*

**Cash King**, nello stato di attesa della riconciliazione, occupa con la
spiegazione del motore lo spazio che altrove è un'illustrazione — *«cioè
esattamente nel momento in cui l'utente ha una domanda e nessuna risposta»*.

**Cash King**, nei modelli di importazione: *«Nessun modello salvato — Salva un
modello durante l'importazione per vederlo qui»* — dice **dove** si crea la cosa
che manca, non che manca.

## Cosa fare

Tre stati vuoti, tre frasi. Nessuna logica.

| File | Cosa scrivere |
|---|---|
| `src/components/prima-nota/regole/RulesTable.tsx` | L'ordine conta e in che direzione: la regola più specifica va sopra la più generica. Con un esempio **nostro**, non tradotto: «se la regola *Enel Energia* è sopra *Enel*, un movimento "ENEL ENERGIA SPA" prende la prima» |
| `src/components/scadenzario/rule-table.tsx` | Stessa cosa per le regole scadenzario, dove `ordine` governa già «la prima che corrisponde vince» — la regola è documentata nel motore (`src/lib/schedule-rules/engine.ts:1-30`) e mai detta all'utente |
| `src/components/scadenzario/recurrence-table.tsx` | Dove si crea una ricorrenza e cosa genera: «Una ricorrenza genera automaticamente le scadenze future. Creane una dal pulsante qui sopra, oppure trasforma in ricorrente una scadenza esistente dal suo dettaglio» |

## Criteri di accettazione

- [ ] Ogni stato vuoto spiega **la regola** o **dove si crea la cosa**, non solo
      che la lista è vuota.
- [ ] Gli esempi sono in italiano e usano nomi plausibili per WEISS — **non**
      esempi tradotti male, che è il difetto di Trezy («Matthieu», «Jean» dentro
      una frase italiana).
- [ ] Il testo sparisce quando la lista ha elementi.
- [ ] Nessuna nuova dipendenza né componente: sono tre blocchi di testo.

## File coinvolti

- `src/components/prima-nota/regole/RulesTable.tsx`
- `src/components/scadenzario/rule-table.tsx`
- `src/components/scadenzario/recurrence-table.tsx`

## Evidenza

- `docs/trezy/02-aree-funzionali/02-03-transazioni-categorizzazione.md` §6.2
- `docs/cashking/02-aree-funzionali/02-01-riconciliazione-assistita.md` §4
- `docs/cashking/02-aree-funzionali/02-06-stampe-import-pianificazione.md` §2.2
- Screenshot: `assets/cashking/screenshots/08-riconciliazione-empty-state-didattico.png`,
  `assets/cashking/screenshots/10-stato-vuoto-regole.png`
