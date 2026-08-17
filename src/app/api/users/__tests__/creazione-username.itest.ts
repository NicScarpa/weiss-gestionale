import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { POST } from '../route'

setupIntegrationDb()

/**
 * Lo username è la chiave con cui si entra, e questa rotta è il posto dove
 * nasce. Due comportamenti che prima non esistevano e che qui si fissano: la
 * regola vale per **tutti** i ruoli (l'email non è più lo username di admin e
 * manager), e chi crea l'utente può **scegliere** lo username invece di
 * accettare la proposta.
 *
 * Si verifica `credentials.username` della risposta e non una `findFirst` per
 * nome: il seed contiene già un «Mario Rossi», e cercare per nome faceva
 * passare il test guardando la persona sbagliata. Per la stessa ragione i nomi
 * qui sotto non compaiono nel seed.
 */

interface RispostaCreazione {
  credentials?: { username: string }
  error?: string
}

function creaUtente(corpo: Record<string, unknown>) {
  return callRoute<RispostaCreazione>(
    POST,
    jsonRequest('http://localhost/api/users', { method: 'POST', body: corpo })
  )
}

const BASE = { firstName: 'Ludovica', lastName: 'Sartorel', role: 'staff' as const }

describe('POST /api/users — lo username', () => {
  beforeEach(() => logout())

  it('è cognome.nome per lo staff', async () => {
    await entraCome('admin')
    const r = await creaUtente(BASE)
    expect(r.status).toBe(201)
    expect(r.body.credentials?.username).toBe('sartorel.ludovica')
  })

  it("è cognome.nome anche per un manager, che prima prendeva l'email", async () => {
    // Era `shouldUseEmailAsUsername`: admin e manager si ritrovavano lo username
    // a forma di indirizzo. Due regole per la stessa cosa, e nemmeno applicate
    // in modo uniforme — in produzione un manager risultava `AndreaSegatto`.
    await entraCome('admin')
    const r = await creaUtente({
      firstName: 'Ludovica',
      lastName: 'Trevisan',
      role: 'manager',
      email: 'ludovica.trevisan@example.com',
    })
    expect(r.status).toBe(201)
    expect(r.body.credentials?.username).toBe('trevisan.ludovica')
  })

  it('sul secondo omonimo aggiunge il progressivo', async () => {
    await entraCome('admin')
    const primo = await creaUtente(BASE)
    const secondo = await creaUtente(BASE)

    expect(primo.body.credentials?.username).toBe('sartorel.ludovica')
    expect(secondo.body.credentials?.username).toBe('sartorel.ludovica2')
  })

  it('rispetta lo username scelto a mano', async () => {
    await entraCome('admin')
    const r = await creaUtente({ ...BASE, username: 'sartorel.ludovica.sala' })
    expect(r.status).toBe(201)
    expect(r.body.credentials?.username).toBe('sartorel.ludovica.sala')

    const salvato = await prisma.user.findUniqueOrThrow({
      where: { username: 'sartorel.ludovica.sala' },
    })
    expect(salvato.firstName).toBe('Ludovica')
  })

  it('accetta lo username scelto con spazi ai bordi o in maiuscolo', async () => {
    await entraCome('admin')
    const r = await creaUtente({ ...BASE, username: '  Sartorel.Ludovica  ' })
    expect(r.status).toBe(201)
    expect(r.body.credentials?.username).toBe('sartorel.ludovica')
  })

  it('rifiuta uno username già occupato, dicendo perché', async () => {
    await entraCome('admin')
    await creaUtente(BASE)

    const r = await creaUtente({
      firstName: 'Marta',
      lastName: 'Zanella',
      role: 'staff',
      username: 'sartorel.ludovica',
    })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/username/i)
  })

  it('rifiuta uno username che non si detta a voce', async () => {
    await entraCome('admin')
    const r = await creaUtente({ ...BASE, username: '../admin' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/username/i)
  })

  it('come staff non si creano utenti', async () => {
    await entraCome('staff')
    const r = await creaUtente(BASE)
    expect(r.status).toBe(403)
  })
})
