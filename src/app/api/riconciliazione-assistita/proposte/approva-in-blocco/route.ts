import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { approvaProposta } from '@/lib/services/reconciliation-decision-service'

/**
 * POST — approva più proposte in un colpo.
 *
 * **Non contiene logica contabile.** Chiama per ogni proposta lo stesso
 * `approvaProposta` del singolo, così i controlli che impediscono di pagare due
 * volte una scadenza restano quelli, applicati uno per uno. Qui dentro sta solo
 * ciò che il blocco aggiunge: l'ordine, il tetto e il riepilogo.
 *
 * Tre scelte, tutte con la loro ragione:
 *
 * - **Una transazione per proposta, non una per il blocco.** Se la settima
 *   viene rifiutata, le prime sei restano approvate: sono decisioni
 *   indipendenti, e annullarle tutte per colpa di una sarebbe un danno
 *   maggiore del problema.
 * - **In sequenza, mai in parallelo.** La produzione ha quindici connessioni
 *   (pooler in session mode): un `Promise.all` su quaranta proposte le
 *   esaurisce e fa cadere anche le richieste degli altri.
 * - **In ordine di punteggio decrescente.** Due proposte sulla stessa riga
 *   bancaria non possono vivere entrambe — lo stesso denaro non salda due
 *   scadenze — e approvarne una supera l'altra. Ordinando, vince la più
 *   convincente invece di quella che capita prima nell'elenco che arriva dal
 *   browser.
 */

/** Oltre questo, la richiesta diventa lunga e il browser sembra piantato. */
const TETTO = 100

const schema = z.object({
  proposalIds: z
    .array(z.string().min(1))
    .min(1, 'Nessuna proposta selezionata')
    .max(TETTO, `Non più di ${TETTO} proposte alla volta`),
})

type EsitoRiga = { proposalId: string; esito: string; motivo?: string; journalEntryId?: string }

export const POST = withAuth(
  async (request, { venueId, user }) => {
    try {
      const validato = schema.safeParse(await request.json())
      if (!validato.success) {
        return NextResponse.json(
          { error: validato.error.issues[0]?.message ?? 'Dati non validi' },
          { status: 400 }
        )
      }

      const { proposalIds } = validato.data

      // L'ordine di percorrenza è il punteggio, non quello ricevuto: è ciò che
      // decide quale proposta sopravvive fra due rivali sulla stessa riga.
      // Le proposte di un'altra sede non compaiono qui e cadranno una per una
      // su `proposta_non_trovata`, che è già il comportamento del singolo.
      const conosciute = await prisma.reconciliationProposal.findMany({
        where: { id: { in: proposalIds }, batch: { venueId } },
        select: { id: true, punteggio: true },
        orderBy: { punteggio: 'desc' },
      })
      const ordinati = [
        ...conosciute.map((p) => p.id),
        ...proposalIds.filter((id) => !conosciute.some((p) => p.id === id)),
      ]

      const dettagli: EsitoRiga[] = []
      let approvate = 0
      let superate = 0
      let giaDecise = 0
      let rifiutate = 0
      const journalEntryIds: string[] = []

      for (const proposalId of ordinati) {
        const esito = await approvaProposta({ proposalId, venueId, userId: user.id ?? null })

        switch (esito.outcome) {
          case 'ok':
            approvate++
            journalEntryIds.push(esito.journalEntryId)
            dettagli.push({ proposalId, esito: 'ok', journalEntryId: esito.journalEntryId })
            break
          case 'superata':
            superate++
            dettagli.push({ proposalId, esito: 'superata', motivo: esito.motivo })
            break
          case 'gia_decisa':
            // Una rivale che il blocco stesso ha appena superato torna da qui,
            // non dal ramo `superata`: quando il ciclo la raggiunge, la sua
            // riga bancaria è già stata assegnata e lo stato è `superata`.
            // Contarla fra le «già decise» direbbe a chi ha premuto il bottone
            // che qualcuno l'aveva decisa prima — mentre è morta ora, per
            // effetto di questa stessa approvazione, ed è un'informazione
            // diversa.
            if (esito.stato === 'superata') {
              superate++
              dettagli.push({
                proposalId,
                esito: 'superata',
                motivo: 'Un’altra proposta ha già preso questo movimento',
              })
            } else {
              giaDecise++
              dettagli.push({ proposalId, esito: 'gia_decisa', motivo: `già ${esito.stato}` })
            }
            break
          case 'proposta_non_trovata':
            rifiutate++
            dettagli.push({ proposalId, esito: 'non_trovata', motivo: 'Proposta non trovata' })
            break
          case 'riconciliazione_rifiutata':
            rifiutate++
            dettagli.push({ proposalId, esito: 'rifiutata', motivo: esito.motivo })
            break
        }
      }

      if (approvate > 0) {
        await createAuditLog({
          action: 'UPDATE',
          entityType: 'ReconciliationProposal',
          userId: user.id ?? null,
          venueId,
          newValues: {
            azione: 'approvazione in blocco',
            richieste: proposalIds.length,
            approvate,
            superate,
            giaDecise,
            rifiutate,
            journalEntryIds,
          },
        })
      }

      // Sempre 200, anche quando nessuna è passata: la richiesta è stata
      // eseguita per intero, ed è il riepilogo a dire com'è andata proposta per
      // proposta. Uno stato d'errore qui direbbe «non è successo niente»,
      // mentre di solito qualcosa è successo.
      return NextResponse.json({ approvate, superate, giaDecise, rifiutate, dettagli })
    } catch (errore) {
      logger.error('Approvazione in blocco fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
