# Ticket pronti per `gh issue create`

Un file per ticket. Ciascuno contiene titolo, contesto, cosa fare, criteri di
accettazione, file coinvolti e riferimenti all'evidenza.

## Come si creano

```bash
cd /Users/nicolascarpa/Desktop/accounting
for f in docs/analisi-competitiva/09-issues/*.md; do
  [ "$(basename "$f")" = "README.md" ] && continue
  title=$(head -1 "$f" | sed 's/^# //')
  gh issue create --title "$title" --body-file "$f" --label tesoreria
done
```

Il primo `# titolo` di ogni file è il titolo dell'issue; il corpo è il file
intero, che GitHub renderizza come markdown.

## Cosa c'è e cosa manca

| | |
|---|---|
| Ticket scritti | **24** |
| Voci di backlog totali | 70 |

I 24 scritti sono: **i 16 quick win** (impatto ≥3, effort S) e **le 8 voci a
impatto più alto** che non sono quick win.

Le altre 46 voci sono specificate in `../07-backlog-prioritizzato.md`, con
verdetto, impatto, effort e nota di implementazione: sono sufficienti a scrivere
il ticket quando servirà, e non lo sono state scritte per non produrre 46 issue
che nessuno leggerà.

## Indice

**Aggiornamento — Onda 1 (11-12 agosto 2026).** Undici quick win chiusi per
intero, tre implementati ma non chiudono la lacuna originaria (v. lo stato
in testa a ciascun file), uno rimosso dall'onda, uno non toccato. Dettaglio
completo in `../07-backlog-prioritizzato.md` e `../02-matrice-5vie.md`.

### Quick win — impatto ≥3, effort S

| File | ID | Imp | Stato |
|---|---|---|---|
| `qw-01-scadenze-pagate-senza-movimento.md` | `SCD-08` | **5** | 🟠 parziale |
| `qw-02-motivazioni-punteggio-match.md` | `RIC-03` | 4 | ✅ chiuso |
| `qw-03-tasso-categorizzazione-kpi.md` | `CLS-16` | 4 | ✅ chiuso |
| `qw-04-scadenzario-mese-spezzato.md` | `SCD-02` | 4 | ⛔ rimossa |
| `qw-05-anzianita-nel-badge.md` | `SCD-04` | 4 | ✅ chiuso |
| `qw-06-giudizio-linguaggio-naturale.md` | `KPI-02` | 4 | ✅ chiuso |
| `qw-07-anteprima-impatto-regola.md` | `CLS-09` | 4 | ✅ chiuso |
| `qw-08-export-separatore-decimale.md` | `RPT-04` | 3 | ✅ chiuso |
| `qw-09-fattori-punteggio-dichiarati.md` | `RIC-04` | 3 | ✅ chiuso |
| `qw-10-zona-negativa-grafico.md` | `KPI-03` | 3 | ✅ chiuso |
| `qw-11-pattuito-contro-effettivo.md` | `SCD-14` | 3 | ✅ chiuso |
| `qw-12-periodo-ancora-durata.md` | `PRV-15` | 3 | ✅ chiuso |
| `qw-13-numero-distinta-versamento.md` | `RET-07` | 3 | 🟠 parziale |
| `qw-14-plausibilita-documento.md` | `DOC-11` | 3 | ⬜ non toccato |
| `qw-15-anteprima-proposte-regola.md` | `CLS-06` | 3 | 🟠 parziale |
| `qw-16-stati-vuoti-didattici.md` | `PLT-07` | 3 | ✅ chiuso |

### Impatto alto, effort maggiore

| File | ID | Imp | Eff | Stato |
|---|---|---|---|---|
| `p1-01-fonte-unica-previsionale.md` | `PRV-03` `PRV-01` `PRV-04` | **5** | M | ✅ chiuso |
| `p1-02-avviso-scadenza-in-arrivo.md` | `ALR-03` | **5** | M | ⬜ non toccato |
| `p1-03-anagrafica-acquirer-pos.md` | `RET-04` | **5** | M | ⬜ non toccato |
| `p1-04-accrediti-pos-attesi.md` | `RET-05` `RET-06` | **5** | L | ⬜ non toccato |
| `p2-01-saldo-per-conto-bancario.md` | `BNK-03` | 4 | L | ⬜ non toccato |
| `p2-02-raggruppamento-movimenti-simili.md` | `MOV-06` | 4 | M | ⬜ non toccato |
| `p2-03-sinonimi-controparti.md` | `CLS-12` | 4 | M | ⬜ non toccato |
| `p2-04-snapshot-previsioni.md` | `SCS-01` | 4 | M | ⬜ non toccato |

## Nota sugli screenshot di riferimento

`assets/cashking/` **è versionato** (tranne `har/`): i riferimenti a quei file
funzionano per chiunque abbia il repo.

`assets/trezy/` e `assets/agicap/` sono **esclusi dal versionamento**
(`.gitignore:48-49`), perché contengono schermate di produzione con dati reali.
Dove il riferimento è a quei prodotti, il ticket cita la **sezione del documento
di analisi** invece del file immagine.
