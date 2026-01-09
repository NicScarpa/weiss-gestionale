import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, 'Seleziona almeno una fattura'),
  password: z.string().min(1, 'Password richiesta'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può eliminare in blocco
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Solo gli amministratori possono eliminare in blocco' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = bulkDeleteSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      )
    }

    const { ids, password } = validationResult.data

    // Verifica password utente
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    })

    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Password non corretta' }, { status: 401 })
    }

    // Verifica che le fatture non siano già registrate o pagate
    const invoicesToDelete = await prisma.electronicInvoice.findMany({
      where: {
        id: { in: ids },
        status: { notIn: ['RECORDED', 'PAID'] },
      },
      select: { id: true },
    })

    if (invoicesToDelete.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna fattura eliminabile. Le fatture registrate o pagate non possono essere eliminate.' },
        { status: 400 }
      )
    }

    const idsToDelete = invoicesToDelete.map((i) => i.id)

    // Elimina le fatture
    const deleteResult = await prisma.electronicInvoice.deleteMany({
      where: { id: { in: idsToDelete } },
    })

    return NextResponse.json({
      deleted: deleteResult.count,
      message: `${deleteResult.count} fatture eliminate con successo`,
    })
  } catch (error) {
    console.error('Errore eliminazione in blocco:', error)
    return NextResponse.json(
      { error: 'Errore durante l\'eliminazione delle fatture' },
      { status: 500 }
    )
  }
}
