# Conti bancari: il saldo per singolo conto

`BNK-03` · impatto 4 · effort L · **l'unica convergenza 4/4 in cui siamo fuori**

## Contesto

`JournalEntry` **non ha un `bankAccountId`**. I saldi esistono solo per
`registerType` (`CASH` / `BANK` aggregato), e `BankAccount` è un'anagrafica che
non partecipa ai conti: la sua unica relazione verso i movimenti passa da
`ScheduleRule.bankAccountId`, cioè dalle regole, non dai movimenti.

Conseguenza: WEISS ha più conti correnti e il gestionale sa dire solo quanto c'è
«in banca», sommato. Quale conto sia coperto e quale no è una domanda che non si
può porre — ed è la precondizione di qualunque decisione di pagamento.

## Cosa fanno loro

**Tutti e quattro.** È l'unica riga della matrice con convergenza `4/4`.

Cash King arriva a mettere due saldi progressivi affiancati sulla stessa riga
della tabella movimenti — quello del conto e quello aziendale — *«per leggere
l'effetto locale e quello consolidato insieme»*, e nella griglia Tesoreria ha una
riga per conto con il proprio fido.

Trezy espone i tre conti singolarmente e li raggruppa per connessione PSD2.
Agicap li tratta come oggetti con soglie proprie.

## Cosa fare

È un L per la migrazione, non per il codice.

1. **`JournalEntry.bankAccountId`**, nullable (`String?`), con indice
   `[bankAccountId, date]`. Nullable di proposito: il DDL va in produzione prima
   del deploy del codice che lo valorizza, come è già stato fatto per
   `costCenterId` — il commento nello schema documenta il pattern.
2. **Valorizzarlo sui percorsi di scrittura**: form movimento, import estratto
   conto (il conto lo sa il file), regole scadenzario (`ScheduleRule.bankAccountId`
   **esiste già** ed è esattamente questo), pagamenti, chiusure.
3. **Migrazione dei dati storici** — attribuire i movimenti `BANK` esistenti al
   conto predefinito (`BankAccount.isDefault`), con uno script tracciato e
   reversibile. Se i conti in uso storicamente sono più d'uno, la mappatura va
   ricostruita a mano: **fermarsi e chiedere**, non indovinare.
4. **`src/lib/saldi.ts`** — estendere `Saldi` con `perConto: Record<bankAccountId,
   SaldoRegistro>`, mantenendo `bankBalance` come somma. La definizione unica non
   cambia: cambia la granularità.
5. **`InitialBalance`** — oggi è per anno e per sede. Diventa per anno, sede e
   conto (`BNK-02`, ticket separato ma va progettato insieme).

## Criteri di accettazione

- [ ] `saldiAlGiorno()` restituisce il saldo per conto **e** il totale, e il
      totale è la somma esatta dei conti.
- [ ] Un movimento creato dal form porta il conto scelto.
- [ ] Un movimento generato da una regola scadenzario porta
      `ScheduleRule.bankAccountId`.
- [ ] Dopo la migrazione, `bankBalance` è **identico** al valore precedente su
      ogni data testata (nessuna regressione sui saldi in produzione).
- [ ] Nessun movimento `BANK` resta senza conto dopo la migrazione.
- [ ] I test di `src/lib/__tests__/saldi.itest.ts` coprono il caso multi-conto.

## Cosa sblocca

- `BNK-02` — saldo iniziale con data **per conto**
- `BNK-05` — fido e saldo disponibile per conto
- `BNK-06` — connessione PSD2, che senza un conto identificabile non ha dove
  scrivere
- La curva del saldo per conto e l'avviso di soglia per conto (`ALR-01`)

## Attenzione

Questa è l'unica voce del backlog che tocca un dato **già in produzione** su cui
poggiano tutti i saldi. Va fatta con la migrazione in due tempi già usata per
`costCenterId`: prima la colonna nullable, poi la valorizzazione, poi
eventualmente il `NOT NULL`.

## File coinvolti

- `prisma/schema.prisma` + migrazione
- `src/lib/saldi.ts`
- `src/lib/__tests__/saldi.itest.ts`
- `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx`
- `src/app/api/bank-transactions/import/route.ts`
- `src/lib/schedule-rules/engine.ts`
- script di migrazione dati in `scripts/`

## Evidenza

- Assenza verificata: `grep -n "bankAccountId" prisma/schema.prisma` → solo
  `ScheduleRule`
- `docs/cashking/02-aree-funzionali/02-02-liquidita-e-previsionale.md` §4
- `docs/cashking/02-aree-funzionali/02-07-conti-team-movimenti.md` §1.1
- `docs/trezy/02-aree-funzionali/02-03-transazioni-categorizzazione.md` §8.1
