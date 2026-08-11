import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import type { MovimentoAggregato } from '../movimenti'
import { costruisciProspetto } from '../prospetto'
import { eseguiControlli } from '../controlli'

const codicePerConto = new Map<string, string>([
  ['c-corrispettivi', '10.01'],
  ['c-versamento', '40.4.01'],
  // I due conti di sistema su cui il versamento serale finisce davvero: la
  // gamba in uscita dalla cassa porta `accountId` = banca, quella in entrata
  // in banca porta `accountId` = cassa (closure-journal-entries.ts:354,373).
  ['c-banca', '110'],
  ['c-cassa', '100'],
  ['c-ignoto', '999.99'],
])

function mov(parziale: Partial<MovimentoAggregato>): MovimentoAggregato {
  return {
    accountId: 'c-corrispettivi',
    mese: 1,
    dare: money(0),
    avere: money(0),
    ivaDare: money(0),
    ivaAvere: money(0),
    ...parziale,
  }
}

// Codici — già risolti dalla system_key, come farebbe risolviContiSistema —
// dei conti di sistema che i test in questo file usano di default.
const codiciSistemaFuoriProspetto = new Set(['100', '110', '120', '121', '122', '200'])
const codiciVersamentoDiSistema = ['100', '110']

function controlli(movimenti: MovimentoAggregato[], variazioneReale = money(0)) {
  const prospetto = costruisciProspetto(movimenti, codicePerConto, money(0), 2026)
  return eseguiControlli({
    prospetto,
    movimenti,
    codicePerConto,
    variazioneReale,
    codiciSistemaFuoriProspetto,
    codiciVersamentoDiSistema,
  })
}

function esito(risultati: ReturnType<typeof controlli>, codice: string) {
  return risultati.find((r) => r.codice === codice)!
}

describe('C1 — quadratura col saldo reale', () => {
  it('ok quando il prospetto spiega tutta la variazione dei saldi', () => {
    const movimenti = [mov({ dare: money(1220), ivaDare: money(220) })]
    expect(esito(controlli(movimenti, money(1220)), 'C1').esito).toBe('ok')
  })

  it('segnala la differenza quando qualcosa non è mappato', () => {
    const movimenti = [mov({ accountId: 'c-ignoto', dare: money(500) })]
    const c1 = esito(controlli(movimenti, money(500)), 'C1')

    expect(c1.esito).toBe('attenzione')
    expect(c1.valore).toBe(500)
  })
})

describe('C2 — versamenti contanti a due gambe', () => {
  it('ok sulla coppia che il versamento serale scrive davvero', () => {
    // La coppia vera, non due movimenti sullo stesso conto: l'uscita dalla
    // cassa e l'entrata in banca, come le genera ogni chiusura.
    const movimenti = [
      mov({ accountId: 'c-banca', avere: money(900) }),
      mov({ accountId: 'c-cassa', dare: money(900) }),
    ]
    expect(esito(controlli(movimenti), 'C2').esito).toBe('ok')
  })

  it('segnala la gamba mancante del versamento serale', () => {
    const movimenti = [mov({ accountId: 'c-cassa', dare: money(900) })]
    const c2 = esito(controlli(movimenti), 'C2')

    expect(c2.esito).toBe('attenzione')
    expect(c2.valore).toBe(900)
  })

  it('guarda anche i giroconti registrati sulle voci 40.4.x del piano v4', () => {
    const movimenti = [mov({ accountId: 'c-versamento', dare: money(900) })]
    const c2 = esito(controlli(movimenti), 'C2')

    expect(c2.esito).toBe('attenzione')
    expect(c2.valore).toBe(900)
  })
})

describe('C3 — movimenti senza voce di conto', () => {
  it('conta i movimenti con accountId nullo', () => {
    const movimenti = [mov({ accountId: null, dare: money(100) })]
    const c3 = esito(controlli(movimenti), 'C3')

    expect(c3.esito).toBe('attenzione')
    expect(c3.valore).toBe(1)
  })
})

describe('C4 — conti non riconosciuti', () => {
  it('conta i conti movimentati che la riclassificazione non conosce', () => {
    const movimenti = [mov({ accountId: 'c-ignoto', avere: money(50) })]
    const c4 = esito(controlli(movimenti), 'C4')

    expect(c4.esito).toBe('attenzione')
    expect(c4.valore).toBe(1)
    expect(c4.spiegazione).toContain('999.99')
  })

  it('non segnala le voci fuori cassa: sono escluse di proposito', () => {
    const conMappaAmpia = new Map(codicePerConto).set('c-ammortamento', '31.01')
    const prospetto = costruisciProspetto(
      [mov({ accountId: 'c-ammortamento', avere: money(700) })],
      conMappaAmpia,
      money(0),
      2026
    )
    const risultati = eseguiControlli({
      prospetto,
      movimenti: [mov({ accountId: 'c-ammortamento', avere: money(700) })],
      codicePerConto: conMappaAmpia,
      variazioneReale: money(0),
      codiciSistemaFuoriProspetto,
      codiciVersamentoDiSistema,
    })

    expect(risultati.find((r) => r.codice === 'C4')!.esito).toBe('ok')
  })

  it('non segnala i conti di sistema: cassa, banca e transitori sono dichiarati', () => {
    // Senza questa dichiarazione C4 segnalerebbe 100 e 110 a ogni esecuzione,
    // perché è lì che il versamento serale scrive: un allarme permanente, che
    // insegna a non leggere il controllo.
    const conPos = new Map(codicePerConto).set('c-pos', '121')
    const movimenti = [
      mov({ accountId: 'c-banca', avere: money(900) }),
      mov({ accountId: 'c-cassa', dare: money(900) }),
      mov({ accountId: 'c-pos', dare: money(300) }),
    ]
    const prospetto = costruisciProspetto(movimenti, conPos, money(0), 2026)
    const risultati = eseguiControlli({
      prospetto,
      movimenti,
      codicePerConto: conPos,
      variazioneReale: money(0),
      codiciSistemaFuoriProspetto,
      codiciVersamentoDiSistema,
    })

    expect(risultati.find((r) => r.codice === 'C4')!.esito).toBe('ok')
  })

  it('un conto di sistema con codice diverso da "100"/"110" resta riconosciuto: la risoluzione è per chiave', () => {
    // Stesso scenario del test sopra, ma con codici che un admin potrebbe
    // aver assegnato dopo un rename da /api/accounts: '100' e '110' non
    // compaiono da nessuna parte. Se C4 dipendesse da quelle stringhe
    // scritte nel codice, questo conto — riconosciuto solo tramite
    // codiciSistemaFuoriProspetto, cioè via system_key — verrebbe segnalato
    // per errore.
    const conCodiciRinominati = new Map(codicePerConto)
      .set('c-banca', 'AAA-banca-rinominata')
      .set('c-cassa', 'BBB-cassa-rinominata')
    const movimenti = [
      mov({ accountId: 'c-banca', avere: money(900) }),
      mov({ accountId: 'c-cassa', dare: money(900) }),
    ]
    const prospetto = costruisciProspetto(movimenti, conCodiciRinominati, money(0), 2026)
    const risultati = eseguiControlli({
      prospetto,
      movimenti,
      codicePerConto: conCodiciRinominati,
      variazioneReale: money(0),
      codiciSistemaFuoriProspetto: new Set(['AAA-banca-rinominata', 'BBB-cassa-rinominata']),
      codiciVersamentoDiSistema: ['BBB-cassa-rinominata', 'AAA-banca-rinominata'],
    })

    expect(esito(risultati, 'C2').esito).toBe('ok')
    expect(esito(risultati, 'C4').esito).toBe('ok')
  })
})
