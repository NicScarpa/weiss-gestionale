import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getVenueId } from '@/lib/venue'

import { checkRequestRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/api-utils'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'

const importSchema = z.object({
    batchId: z.string().min(1, 'batchId è richiesto'),
})

/**
 * POST /api/prima-nota/import
 * Converts imported BankTransactions (from a specific batch) into JournalEntries.
 * This creates BANK-type journal entries from each bank transaction.
 */
export async function POST(request: NextRequest) {
    try {
        const rateCheck = checkRequestRateLimit(request, 'import:journal', RATE_LIMIT_CONFIGS.IMPORT)
        if (!rateCheck.allowed) return rateCheck.response!

        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
        }

        if (!['admin', 'manager'].includes(session.user.role || '')) {
          return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
        }

        const venueId = await getVenueId()
        const body = await request.json()
        const { batchId } = importSchema.parse(body)

        // Get all bank transactions from the batch that don't already have a matched journal entry
        const transactions = await prisma.bankTransaction.findMany({
            where: {
                importBatchId: batchId,
                venueId,
                matchedEntryId: null, // Only unmatched ones
            },
            orderBy: { transactionDate: 'asc' },
        })

        if (transactions.length === 0) {
            return NextResponse.json({
                created: 0,
                message: 'Nessuna transazione da convertire',
            })
        }

        const result = await prisma.$transaction(async (tx) => {
            let created = 0
            const errors: Array<{ transactionId: string; error: string }> = []

            // Un movimento importato non porta ancora un conto (BankTransaction
            // non ne ha uno): l'input della risoluzione è identico per tutte le
            // righe, quindi il centro si risolve una volta sola invece che a
            // ogni riga. Nessun conto significa nessuna regola da rispettare:
            // il sistema sta indovinando, e su un percorso automatico indovina
            // il centro operativo predefinito (WEISS), non la struttura — la
            // stragrande maggioranza dei bonifici è gestione ordinaria del
            // locale. Quando le righe importate porteranno un conto, la
            // chiamata va spostata dentro il ciclo e la riga che non risolve va
            // scartata con il motivo, senza fermare le altre.
            const centro = await risolviCentroDiCosto(tx, { accountId: null }, 'automatico')
            if (centro.outcome === 'invalid') {
                // Irraggiungibile senza conto: il tipo lo prevede, i dati no.
                throw new Error(centro.motivo)
            }

            for (const bankTx of transactions) {
                try {
                    const amount = Number(bankTx.amount)
                    const isInflow = amount > 0

                    // Create journal entry
                    const entry = await tx.journalEntry.create({
                        data: {
                            venueId,
                            date: bankTx.transactionDate,
                            registerType: 'BANK',
                            description: bankTx.description,
                            debitAmount: isInflow ? Math.abs(amount) : null,
                            creditAmount: !isInflow ? Math.abs(amount) : null,
                            costCenterId: centro.costCenterId,
                            costCenterSource: centro.origine,
                            categorizationSource: 'import',
                            // Il centro è una supposizione del sistema e il
                            // conto non c'è ancora: l'imputazione va approvata
                            // a mano prima di valere come verificata.
                            verified: false,
                            notes: bankTx.bankReference ? `Rif. banca: ${bankTx.bankReference}` : undefined,
                            createdById: session.user.id,
                        },
                    })

                    // Link bank transaction to journal entry
                    await tx.bankTransaction.update({
                        where: { id: bankTx.id },
                        data: {
                            matchedEntryId: entry.id,
                            status: 'MATCHED',
                            matchConfidence: 1.0,
                            reconciledBy: session.user.id,
                            reconciledAt: new Date(),
                        },
                    })

                    created++
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Errore sconosciuto'
                    errors.push({ transactionId: bankTx.id, error: message })
                }
            }

            return { created, total: transactions.length, errors }
        })

        await createAuditLog({
            userId: session.user.id,
            action: 'CREATE',
            entityType: 'JournalEntry',
            entityId: batchId,
            venueId,
            newValues: { batchId, created: result.created, total: result.total },
        })

        return NextResponse.json(result)
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Dati non validi', details: error.issues },
                { status: 400 }
            )
        }

        logger.error('POST /api/prima-nota/import error', error)
        return NextResponse.json(
            { error: 'Errore nella conversione dei movimenti' },
            { status: 500 }
        )
    }
}
