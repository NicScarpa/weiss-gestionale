import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/bank-transactions/delete-all - Elimina TUTTE le transazioni bancarie
// ATTENZIONE: Endpoint temporaneo per pulizia dati - DA RIMUOVERE dopo l'uso
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può fare questa operazione
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Elimina tutte le transazioni bancarie
    const txResult = await prisma.bankTransaction.deleteMany({})

    // Elimina tutti i batch di import
    const batchResult = await prisma.importBatch.deleteMany({})

    return NextResponse.json({
      success: true,
      deletedTransactions: txResult.count,
      deletedBatches: batchResult.count,
    })
  } catch (error) {
    console.error('DELETE /api/bank-transactions/delete-all error:', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione delle transazioni' },
      { status: 500 }
    )
  }
}
