import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'

interface RouteContext {
  params: Promise<{ id: string }>
}

const correzioneSchema = z.object({
  accountId: z.string().min(1),
})

/**
 * Cerca la memoria dentro la sede in sessione. Una memoria di un altro locale
 * non è «negata»: non esiste, e la risposta è 404 come per un id inventato.
 */
async function memoriaDellaSede(id: string, venueId: string) {
  return prisma.supplierProductAccount.findFirst({
    where: { id, venueId },
    include: {
      supplier: { select: { name: true } },
      account: { select: { code: true, name: true } },
    },
  })
}

async function autorizza() {
  const session = await auth()

  if (!session?.user) {
    return { errore: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) }
  }
  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return { errore: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }

  return { userId: session.user.id, venueId: await getVenueId() }
}

/**
 * Dimentica una mappatura imparata.
 *
 * Cancellazione fisica, non logica: `SupplierProductAccount` non è fra i
 * modelli a cancellazione logica (`SOFT_DELETE_MODELS`), che coprono i
 * documenti contabili — una memoria non è un documento, è una deduzione, e una
 * deduzione sbagliata va tolta di mezzo. Quel che resta è la riga di audit, che
 * porta con sé cosa mappava: senza, non ci sarebbe traccia di cosa è stato
 * dimenticato né di chi l'ha deciso.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const autorizzazione = await autorizza()
    if (autorizzazione.errore) return autorizzazione.errore
    const { userId, venueId } = autorizzazione

    const { id } = await context.params
    const memoria = await memoriaDellaSede(id, venueId)
    if (!memoria) {
      return NextResponse.json({ error: 'Memoria non trovata' }, { status: 404 })
    }

    await prisma.supplierProductAccount.delete({ where: { id } })

    await createAuditLog({
      userId,
      action: 'DELETE',
      entityType: 'SupplierProductAccount',
      entityId: id,
      venueId,
      oldValues: {
        fornitore: memoria.supplier.name,
        nomeNormalizzato: memoria.nomeNormalizzato,
        codiceArticolo: memoria.codiceArticolo,
        accountId: memoria.accountId,
        conto: memoria.account.name,
        conferme: memoria.conferme,
      },
    })

    return NextResponse.json({ esito: 'ok' })
  } catch (error) {
    logger.error('Errore DELETE /api/memorie-fornitore/[id]', error)
    return NextResponse.json({ error: 'Errore nella cancellazione della memoria' }, { status: 500 })
  }
}

/**
 * Corregge il conto di una mappatura imparata.
 *
 * È la strada rapida: prima, per rimediare a una conferma sbagliata, bisognava
 * ritrovare una fattura che contenesse quel prodotto e riconfermarla a mano.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const autorizzazione = await autorizza()
    if (autorizzazione.errore) return autorizzazione.errore
    const { userId, venueId } = autorizzazione

    const { id } = await context.params
    const { accountId } = correzioneSchema.parse(await request.json())

    const memoria = await memoriaDellaSede(id, venueId)
    if (!memoria) {
      return NextResponse.json({ error: 'Memoria non trovata' }, { status: 404 })
    }

    // Stesso perimetro della conferma di una riga fattura: una memoria può
    // puntare solo a un conto di costo attivo, altrimenti da qui si
    // imputerebbero costi a un conto di ricavo.
    const conto = await prisma.account.findFirst({
      where: { id: accountId, isActive: true, type: 'COSTO' },
      select: { id: true, name: true },
    })
    if (!conto) {
      return NextResponse.json(
        { error: 'Il conto non esiste, non è attivo o non è di tipo COSTO' },
        { status: 400 }
      )
    }

    await prisma.supplierProductAccount.update({
      where: { id },
      // Le conferme accumulate valevano per il conto vecchio: tenerle direbbe
      // che questa mappatura è stata confermata N volte, e non è vero. Il
      // contatore ordina gli esempi che finiscono nel prompt (vedi
      // memoriePerIlPrompt), quindi deve dire il vero.
      data: { accountId, conferme: 1 },
    })

    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'SupplierProductAccount',
      entityId: id,
      venueId,
      oldValues: { accountId: memoria.accountId, conto: memoria.account.name },
      newValues: { accountId, conto: conto.name },
    })

    return NextResponse.json({ esito: 'ok' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }

    logger.error('Errore PATCH /api/memorie-fornitore/[id]', error)
    return NextResponse.json({ error: 'Errore nella correzione della memoria' }, { status: 500 })
  }
}
