import { describe, it, expect } from 'vitest'
import { opzioneTls } from '../db-tls'

/**
 * Politica TLS della connessione al database.
 *
 * In produzione il TLS era imposto senza eccezioni, e `npm start` non riusciva
 * più a parlare con un PostgreSQL locale: provare una build di produzione — la
 * PWA, il comportamento offline — richiedeva di alzare un proxy TLS finto.
 * L'eccezione esiste per quello, e per nient'altro: vale solo quando il
 * database sta sulla macchina stessa.
 *
 * I casi qui sotto che contano davvero sono quelli negativi: la via d'uscita
 * non si deve poter aprire verso la produzione, nemmeno da parte di chi
 * scriva la stringa di connessione apposta.
 */

const SUPABASE = 'postgresql://postgres:segreta@db.abcdefgh.supabase.co:6543/postgres?pgbouncer=true'
const LOCALE = 'postgresql://nicolascarpa@127.0.0.1:5432/weiss'

describe('opzioneTls', () => {
  it('impone il TLS in produzione verso un database remoto', () => {
    expect(opzioneTls({ NODE_ENV: 'production', DATABASE_URL: SUPABASE })).toEqual({
      rejectUnauthorized: true,
    })
  })

  it('usa il certificato dichiarato quando c\'è', () => {
    expect(
      opzioneTls({
        NODE_ENV: 'production',
        DATABASE_URL: SUPABASE,
        DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----',
      })
    ).toEqual({ ca: '-----BEGIN CERTIFICATE-----', rejectUnauthorized: true })
  })

  it('non chiede il TLS fuori dalla produzione', () => {
    expect(opzioneTls({ NODE_ENV: 'development', DATABASE_URL: SUPABASE })).toBe(false)
  })

  it.each([
    ['127.0.0.1', LOCALE],
    ['localhost', 'postgresql://weiss@localhost:5432/weiss'],
    ['::1', 'postgresql://weiss@[::1]:5432/weiss'],
  ])('lascia provare la build di produzione contro %s', (_host, url) => {
    expect(opzioneTls({ NODE_ENV: 'production', DATABASE_URL: url })).toBe(false)
  })

  it('non si lascia ingannare da un host che somiglia a quello locale', () => {
    expect(
      opzioneTls({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@localhost.attaccante.example/weiss',
      })
    ).toEqual({ rejectUnauthorized: true })
  })

  // `pg` legge un parametro `host` dalla query e quello prevale sull'indirizzo
  // scritto nell'autorità: senza questo controllo la stringa qui sotto
  // sembrerebbe locale e aprirebbe una connessione in chiaro verso Supabase.
  it.each(['host', 'hostaddr', 'HOST'])(
    'rifiuta la via d\'uscita se la query riscrive la destinazione con %s',
    (parametro) => {
      expect(
        opzioneTls({
          NODE_ENV: 'production',
          DATABASE_URL: `${LOCALE}?${parametro}=db.abcdefgh.supabase.co`,
        })
      ).toEqual({ rejectUnauthorized: true })
    }
  )

  it.each([
    ['assente', undefined],
    ['illeggibile', 'non-è-un-url'],
  ])('impone il TLS quando la stringa di connessione è %s', (_caso, url) => {
    expect(opzioneTls({ NODE_ENV: 'production', DATABASE_URL: url })).toEqual({
      rejectUnauthorized: true,
    })
  })

  it('lascia passare gli altri parametri di connessione senza sospetti', () => {
    expect(
      opzioneTls({ NODE_ENV: 'production', DATABASE_URL: `${LOCALE}?connection_limit=5` })
    ).toBe(false)
  })
})
