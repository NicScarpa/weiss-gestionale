import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Presidio sull'unica cosa che tiene lo staff fuori dalla dashboard: la
 * separazione dei gruppi di rotte.
 *
 * Il difetto: il layout di `(dashboard)` consentiva allo staff la sola
 * `/chiusura-cassa`, confrontando un elenco con l'header `x-pathname`. Ma la
 * chiusura cassa stava *dentro* quel gruppo, e per la partial rendering di Next
 * un layout condiviso non viene rieseguito quando si naviga fra due rotte che
 * lo condividono. Dalla chiusura, un tocco sul menu apriva davvero
 * `/prima-nota/movimenti` — dati finanziari caricati dal server compresi —
 * perché quel controllo non veniva mai eseguito.
 *
 * Ora la chiusura vive in `(chiusura)`: lo staff non ha mai il layout della
 * dashboard nell'albero del router, quindi ogni navigazione verso una rotta
 * riservata lo monta da zero e il rimando al portale scatta. È un invariante
 * strutturale, e va verificato staticamente: chi domani spostasse una sezione
 * accessibile allo staff dentro `(dashboard)` riaprirebbe il buco senza che
 * niente protesti.
 */

const APP = join(__dirname, '..')
const DASHBOARD = join(APP, '(dashboard)')
const CHIUSURA = join(APP, '(chiusura)')

/** Percorsi del gestionale (fuori dal portale) aperti anche al ruolo `staff`. */
const SEZIONI_APERTE_ALLO_STAFF = ['chiusura-cassa']

function sottocartelle(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((v) => v.isDirectory() && v.name !== '__tests__')
    .map((v) => v.name)
}

describe('accesso dello staff alla dashboard', () => {
  it('nessuna sezione aperta allo staff vive dentro (dashboard)', () => {
    const dentroDashboard = sottocartelle(DASHBOARD)

    for (const sezione of SEZIONI_APERTE_ALLO_STAFF) {
      expect(
        dentroDashboard,
        `«${sezione}» è accessibile allo staff: dentro (dashboard) il controllo di ruolo ` +
          'del layout non viene eseguito sulle navigazioni lato client. Spostala in (chiusura).'
      ).not.toContain(sezione)
    }
  })

  it('le sezioni aperte allo staff stanno nel gruppo (chiusura), che ha il suo layout', () => {
    expect(existsSync(join(CHIUSURA, 'layout.tsx'))).toBe(true)

    const dentroChiusura = sottocartelle(CHIUSURA)
    for (const sezione of SEZIONI_APERTE_ALLO_STAFF) {
      expect(dentroChiusura).toContain(sezione)
    }
  })

  it('il layout di (dashboard) rimanda lo staff al portale senza eccezioni', () => {
    const sorgente = readFileSync(join(DASHBOARD, 'layout.tsx'), 'utf8')

    // Il rimando c'è…
    expect(sorgente).toMatch(/role === 'staff'/)
    expect(sorgente).toMatch(/redirect\('\/portale'\)/)

    // …e non è condizionato dal percorso. L'elenco di eccezioni confrontato con
    // l'header `x-pathname` è proprio la costruzione che non teneva: si guarda
    // il codice, non i commenti, perché è la lettura di `headers()` il segno che
    // quella costruzione è tornata.
    const codice = sorgente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(
      codice,
      'il layout di (dashboard) non deve decidere in base al percorso: su navigazione lato ' +
        'client non viene rieseguito, quindi un elenco di eccezioni non verrebbe mai valutato'
    ).not.toMatch(/headers\(\)/)
  })
})
