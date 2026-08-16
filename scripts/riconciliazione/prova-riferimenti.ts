/**
 * Il fattore «riferimento» scatta quando dovrebbe?
 *
 * Vale 20 punti su 100 — il più pesante dopo l'importo — e un falso negativo
 * qui **non lascia traccia**: la proposta nasce con venti punti in meno e
 * scivola sotto la soglia, senza che nulla lo segnali.
 *
 * I casi qui sotto vengono dalle proposte vere generate sui movimenti
 * sincronizzati il 16 agosto 2026.
 */
import { contieneRiferimento } from '../../src/lib/reconciliation/causale'

interface Caso {
  nota: string
  causale: string
  fattura: string
  atteso: boolean
}

const casi: Caso[] = [
  {
    nota: 'il numero è nella causale, preceduto da «Ft.N.»',
    causale:
      'SDD Core - Richiesta Incasso SEPA Ft.N.3300/00/2026 30/05/2026 MA.IN.CART. S.R.L. IT59g0708412000000000021871',
    fattura: '3300/00/2026',
    atteso: true,
  },
  {
    nota: 'il numero NON è nella causale (contratto di leasing)',
    causale:
      'SDD Core - Richiesta Incasso SEPA CONTR.427140/IM DEL 31.01.23 EFF. N FRAER LEASING S.P.A. 00227198IM427140000',
    fattura: '01-0087548-2026',
    atteso: false,
  },
  {
    nota: 'forma esplicita, già verificata funzionante',
    causale:
      'SDD B2B - Richiesta Incasso SEPA FATTURA N. EE00874136/2026 DEL 16-0 Segnoverde S.p.A. uni',
    fattura: 'EE00874136/2026',
    atteso: true,
  },
  {
    nota: 'numero abbreviato: «FT 319» per la fattura FDI/0000319',
    causale:
      'Bonifico tramite Internet Banking *INSTANT DEL 05/06/2026 ORE 09:43 ID. 0708400040787702486499064990IT BEN SERIPIAVE SNCFT 319',
    fattura: 'FDI/0000319',
    atteso: true,
  },
]

let sorprese = 0

for (const c of casi) {
  const trovato = contieneRiferimento(c.causale, c.fattura)
  const coincide = trovato === c.atteso
  if (!coincide) sorprese++

  console.log(`\n${coincide ? '  ' : '⚠️'} ${c.nota}`)
  console.log(`   fattura  ${c.fattura}`)
  console.log(`   causale  ...${c.causale.slice(0, 110)}`)
  console.log(`   atteso ${c.atteso ? 'SÌ' : 'NO'}  →  ottenuto ${trovato ? 'SÌ' : 'NO'}`)
}

console.log(
  sorprese === 0
    ? '\nNessuna sorpresa: il fattore riferimento si comporta come previsto.\n'
    : `\n${sorprese} casi si comportano diversamente da come ci si aspetta.\n`
)
