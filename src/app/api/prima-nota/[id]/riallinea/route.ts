import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { imputazioniDivergenti, riallineaFette, RiallineamentoNonRigenerabile } from '@/lib/invoices/riallineamento'
import { MESSAGGIO_NESSUNA_DIVERGENZA, MESSAGGIO_MAI_GENERATE_FETTE, MESSAGGIO_RIALLINEATO } from './messaggi'

// Le costanti NON si ri-esportano di qui. Una route può esportare solo i
// metodi HTTP e `config`: qualunque altro simbolo fa fallire il controllo che
// Next genera sotto webpack (`OmitWithTag ... does not satisfy { [x: string]:
// never }`). La ri-esportazione era un ponte per chi le importava da questa
// rotta, e non la usa più nessuno: i due test le prendono già da
// `./messaggi.ts`, che è anche il posto giusto — un modulo senza
// `next/server`/`next-auth`, importabile da un test lato client.

/**
 * POST /api/prima-nota/[id]/riallinea
 *
 * Cancella le fette ereditate divergenti del movimento e le rigenera dalle
 * imputazioni correnti della fattura (Task 7, spec sezione 2). Risponde 409
 * se non c'è nessuna divergenza da riallineare: riallineare qualcosa che è
 * già allineato deve essere un errore esplicito, non un no-op silenzioso.
 * Risponde 422 se il riallineamento non può rigenerare le fette (una
 * guardia di `ereditaFetteDaFattura` blocca la fattura oggi): in quel caso
 * `riallineaFette` ha già fatto fare rollback alla transazione, nessuna
 * fetta è andata persa.
 */
export const POST = withAuth<{ id: string }>(
  async (request, { params, venueId, user }) => {
    try {
      const { id } = params

      const movimento = await prisma.journalEntry.findFirst({
        where: { id, venueId },
        select: { id: true },
      })
      if (!movimento) {
        return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
      }

      const divergenza = await imputazioniDivergenti(id)
      if (!divergenza.divergente) {
        // Due cause diverse dietro lo stesso "niente da riallineare qui", e solo
        // una è davvero "tutto a posto": una riconciliazione che non ha MAI
        // scritto fette ereditate (la fattura non era coperta per intero
        // all'epoca) non compare mai nella rilevazione, quindi risponderebbe lo
        // stesso 409 di un movimento davvero allineato — ma qui non c'è nessun
        // pulsante che aiuti: va completata l'imputazione sulla fattura.
        const senzaFette = await prisma.scheduleReconciliation.findFirst({
          where: {
            journalEntryId: id,
            status: 'VERIFIED',
            schedule: { invoiceId: { not: null } },
            allocations: { none: {} },
          },
          select: { id: true },
        })

        // Non "Questa riconciliazione": su un bonifico cumulativo (più
        // riconciliazioni sullo stesso movimento) basterebbe che UNA sia senza
        // fette perché la query la trovi, anche quando le altre sono
        // semplicemente allineate. Il messaggio resta meno assertivo apposta.
        return NextResponse.json(
          { error: senzaFette ? MESSAGGIO_MAI_GENERATE_FETTE : MESSAGGIO_NESSUNA_DIVERGENZA },
          { status: 409 }
        )
      }

      const eseguiti = await prisma.$transaction((tx) => riallineaFette(tx, id))

      // Scritto DOPO che la transazione è risolta: `createAuditLog` usa il
      // client globale, non `tx`, quindi scriverlo prima si committerebbe anche
      // se il resto facesse rollback (vedi il docblock di `riallineaFette`).
      for (const esito of eseguiti) {
        await createAuditLog({
          userId: user.id,
          action: 'UPDATE',
          entityType: 'ScheduleReconciliation',
          entityId: esito.reconciliationId,
          venueId,
          oldValues: { fette: esito.fetteRimosse },
          newValues: { fette: esito.fetteScritte, invoiceId: esito.invoiceId, riallineamento: true },
        })
      }

      return NextResponse.json({
        fette: eseguiti.reduce((somma, esito) => somma + esito.fetteScritte, 0),
        invoiceId: divergenza.invoiceId,
        message: MESSAGGIO_RIALLINEATO,
      })
    } catch (error) {
      if (error instanceof RiallineamentoNonRigenerabile) {
        return NextResponse.json({ error: error.message }, { status: 422 })
      }

      logger.error('Errore POST /api/prima-nota/[id]/riallinea', error)
      return NextResponse.json(
        { error: 'Errore nel riallineamento delle fette' },
        { status: 500 }
      )
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
