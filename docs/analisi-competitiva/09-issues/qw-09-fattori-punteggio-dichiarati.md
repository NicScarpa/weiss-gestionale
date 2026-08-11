# Riconciliazione: dichiarare pesi e soglie del punteggio prima di usarlo

`RIC-04` · impatto 3 · effort **S** · quick win #9

## Contesto

`SCHEDULE_MATCH_WEIGHTS` (importo 55%, data 25%, descrizione 20%) e
`SCHEDULE_MATCH_THRESHOLDS` (`SUGGESTED = 0.75`, `MINIMUM = 0.45`) sono **cablate
nel codice e mai mostrate**
(`src/lib/reconciliation/schedule-matcher.ts:16-27`). L'utente non sa perché
sotto una certa affinità i candidati spariscono del tutto, né perché l'importo
pesi più della controparte.

## Cosa fa Cash King

Prima di lanciare l'analisi, la pagina **non è vuota**: mostra il titolo
«Seleziona un periodo e avvia l'analisi», la spiegazione del motore, e la tabella
delle sei regole con sigla e descrizione.

> *«Un motore di abbinamento automatico è una scatola nera che l'utente deve
> imparare a fidarsi. Mostrare l'elenco delle regole prima di eseguire trasforma
> "il software ha deciso" in "il software ha applicato la regola R4", che è
> contestabile e quindi credibile.»*

Nel loro caso, dichiarare i parametri ha permesso di scoprire un'incoerenza reale:
`minScore: 50` rende la fascia documentata «bassa 0-49» **strutturalmente
irraggiungibile**. Le soglie dichiarate sono ciò che rende trovabili errori del
genere.

## Cosa fare

**`src/components/scadenzario/schedule-reconciliation-panel.tsx`** — un
`<Collapsible>` «Come funziona il punteggio», chiuso per default, sopra la lista
dei candidati:

```
Il punteggio pesa tre fattori:
  Importo       55%   quanto il movimento copre il residuo della scadenza
  Data          25%   quanto è vicino alla data attesa (finestra −30 / +90 giorni)
  Descrizione   20%   somiglianza fra causale e controparte
  + 15%               se il numero documento compare nella causale

Sopra il 75% il match è proposto come attendibile.
Sotto il 45% il candidato non viene mostrato.
```

I valori vanno **letti dalle costanti esportate**, non riscritti a mano: se
domani i pesi cambiano, il testo cambia con loro. `SCHEDULE_MATCH_WEIGHTS` e
`SCHEDULE_MATCH_THRESHOLDS` sono già `export const`.

## Criteri di accettazione

- [ ] I pesi e le soglie mostrati provengono dalle costanti, non da stringhe
      letterali.
- [ ] Cambiando `SCHEDULE_MATCH_WEIGHTS.AMOUNT` nel codice, il testo cambia.
- [ ] Il pannello è chiuso per default e non ruba spazio.
- [ ] La finestra temporale dichiarata (−30 / +90 giorni per `findEntryCandidates`)
      corrisponde a quella effettivamente usata nel codice.

## Nota

Va fatto **insieme a `RIC-03`** (`qw-02`): le motivazioni sul singolo candidato e
la spiegazione dei fattori sono la stessa idea a due livelli di zoom, e toccano lo
stesso componente.

## File coinvolti

- `src/components/scadenzario/schedule-reconciliation-panel.tsx`
- `src/lib/reconciliation/schedule-matcher.ts` (solo lettura delle costanti)

## Evidenza

- `docs/cashking/02-aree-funzionali/02-01-riconciliazione-assistita.md` §3, §4, §5b
- Screenshot: `assets/cashking/screenshots/08-riconciliazione-empty-state-didattico.png`
