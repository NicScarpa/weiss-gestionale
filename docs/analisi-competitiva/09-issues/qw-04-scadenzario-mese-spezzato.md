# Scadenzario: separare «scaduto» da «da saldare» dentro il mese corrente

`SCD-02` · impatto 4 · effort **S** · quick win #4

## Contesto

Le scadenze si raggruppano per mese. Ad agosto, una fattura che doveva essere
pagata il 3 e una che scade il 28 finiscono nello stesso gruppo — e sono due
urgenze completamente diverse.

## Cosa fa Cash King

Il mese corrente è **spezzato in due righe distinte**:

| Gruppo | N. | Importo |
|---|---|---|
| Luglio 2026 | 6 | 22.962,24 € |
| **Agosto 2026 — Scaduto** | 1 | 3.954,16 € |
| **Agosto 2026 — Da Saldare** | 4 | 15.378,38 € |
| Settembre 2026 | 5 | 11.361,23 € |

I `data-testid` confermano lo schema: quattro famiglie (scaduto/normale ×
incasso/pagamento) indicizzate per mese — `month-overdue-pay-2026-08`,
`month-pay-2026-09`.

Due osservazioni che l'analisi tira e che conviene copiare insieme:

1. *«È la distinzione che conta davvero all'inizio del mese: ciò che è già in
   ritardo non è la stessa cosa di ciò che scade fra due settimane.»*
2. **I mesi passati non vengono collassati** in un unico «scaduto»: aprile,
   maggio e luglio restano righe distinte, così l'anzianità resta leggibile senza
   aprire un report separato.

## Cosa fare

**`src/app/(dashboard)/scadenzario/page.tsx`** — la chiave di raggruppamento
passa da `{anno-mese}` a `{anno-mese, scaduto: boolean}`, dove `scaduto` è
`(dataAttesa ?? dataScadenza) < oggi`.

L'etichetta del gruppo diventa `Agosto 2026 — Scaduto` / `Agosto 2026 — Da
saldare`. Solo il mese corrente si spezza: sui mesi passati tutto è scaduto, sui
futuri niente lo è, e in entrambi i casi la seconda riga sarebbe vuota.

Il fallback `dataAttesa ?? dataScadenza` è obbligatorio: è la stessa regola che
usano `aging` e `saldo-scalare`, e usare `dataScadenza` nuda produrrebbe un
raggruppamento incoerente con il resto dell'applicazione.

## Criteri di accettazione

- [ ] Nel mese corrente compaiono due gruppi quando esistono sia scadenze scadute
      sia non scadute; uno solo quando ce n'è di un tipo solo.
- [ ] I mesi passati e futuri restano un gruppo ciascuno.
- [ ] I mesi passati **non** sono aggregati in un unico gruppo «scaduto».
- [ ] Il criterio di scaduto usa `dataAttesa ?? dataScadenza`, coerente con
      `/api/scadenzario/aging`.
- [ ] I totali per gruppo sommano al totale complessivo mostrato in testata.

## File coinvolti

- `src/app/(dashboard)/scadenzario/page.tsx`

Nessuna modifica al backend: il dato c'è già nella risposta di
`GET /api/scadenzario`.

## Evidenza

- `docs/cashking/02-aree-funzionali/02-03-scadenzario.md` §4
- Screenshot: `assets/cashking/screenshots/05-scadenziario-completo.png`
