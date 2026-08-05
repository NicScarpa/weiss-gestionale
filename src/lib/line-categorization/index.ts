import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { parseFatturaPA } from '@/lib/sdi/parser'
import { normalizeProductName } from '@/lib/price-tracking'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import type { DettaglioLinea } from '@/lib/sdi/types'

const MODELLO_AI = 'claude-haiku-4-5'
const MAX_TOKENS_AI = 4096

const RispostaAi = z.object({
  righe: z.array(
    z.object({
      numeroLinea: z.number(),
      accountId: z.string(),
      confidence: z.number(),
      motivo: z.string(),
      dubbioSuMemoria: z.boolean(),
    })
  ),
})

interface CategorizzaRigheFatturaInput {
  invoiceId: string
  venueId: string
}

/**
 * Pipeline di categorizzazione delle righe fattura (Fase 4, ondata B):
 * memoria del fornitore prima, AI poi. Best-effort assoluto — non lancia mai,
 * chiamata dopo l'import/parse della fattura (Task 9).
 *
 * Vedi docs/superpowers/specs/2026-08-05-allocation-design.md (Fase 4).
 */
export async function categorizzaRigheFattura({
  invoiceId,
}: CategorizzaRigheFatturaInput): Promise<void> {
  try {
    const invoice = await prisma.electronicInvoice.findUnique({
      where: { id: invoiceId },
      select: { supplierId: true, xmlContent: true, venueId: true },
    })
    if (!invoice || !invoice.xmlContent) return

    const fattura = parseFatturaPA(invoice.xmlContent)
    const righeXml = fattura.dettaglioLinee ?? []
    if (righeXml.length === 0) return

    const esistenti = await prisma.invoiceLineAccount.findMany({
      where: { invoiceId },
      select: { numeroLinea: true },
    })
    const numeriEsistenti = new Set(esistenti.map((r) => r.numeroLinea))
    const righeDaProcessare = righeXml.filter((r) => !numeriEsistenti.has(r.numeroLinea))
    if (righeDaProcessare.length === 0) return

    // Memoria prima: match per codiceArticolo esatto, poi per nomeNormalizzato.
    const memorie = invoice.supplierId
      ? await prisma.supplierProductAccount.findMany({ where: { supplierId: invoice.supplierId } })
      : []

    const righeMatchate = new Map<number, { accountId: string }>()
    const righeScoperte: DettaglioLinea[] = []

    for (const riga of righeDaProcessare) {
      const nomeNormalizzato = normalizeProductName(riga.descrizione)
      const memoriaPerCodice = riga.codiceArticolo
        ? memorie.find((m) => m.codiceArticolo && m.codiceArticolo === riga.codiceArticolo)
        : undefined
      const memoria = memoriaPerCodice ?? memorie.find((m) => m.nomeNormalizzato === nomeNormalizzato)

      if (memoria) {
        righeMatchate.set(riga.numeroLinea, { accountId: memoria.accountId })
      } else {
        righeScoperte.push(riga)
      }
    }

    // Le righe matchate si scrivono subito: confermate dalla memoria, mai
    // sovrascritte da qui in avanti (solo l'eventuale dubbio dell'AI le
    // riporta a 'proposta', più sotto).
    for (const riga of righeDaProcessare) {
      const match = righeMatchate.get(riga.numeroLinea)
      if (!match) continue
      await prisma.invoiceLineAccount.create({
        data: {
          invoiceId,
          numeroLinea: riga.numeroLinea,
          descrizione: riga.descrizione,
          codiceArticolo: riga.codiceArticolo ?? null,
          importo: riga.prezzoTotale,
          accountId: match.accountId,
          stato: 'confermata',
          fonte: 'regola-appresa',
        },
      })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      logger.info('Categorizzazione AI saltata: ANTHROPIC_API_KEY assente', { invoiceId })
      return
    }

    const conti = await prisma.account.findMany({
      where: { type: 'COSTO', isActive: true },
      select: { id: true, name: true },
    })

    const prompt = await costruisciPrompt({ conti, memorie, righeDaProcessare, righeMatchate })

    let response
    try {
      const client = new Anthropic()
      response = await client.messages.parse({
        model: MODELLO_AI,
        max_tokens: MAX_TOKENS_AI,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: zodOutputFormat(RispostaAi) },
      })
    } catch (error) {
      logger.error('Errore nella chiamata AI per la categorizzazione righe fattura', error, {
        invoiceId,
      })
      return
    }

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      logger.warn('Risposta AI non utilizzabile per la categorizzazione righe fattura', {
        invoiceId,
        stopReason: response.stop_reason,
      })
      return
    }

    const idContiValidi = new Set(conti.map((c) => c.id))
    const righePerNumero = new Map(righeDaProcessare.map((r) => [r.numeroLinea, r]))

    for (const rigaAi of response.parsed_output.righe) {
      const rigaOriginale = righePerNumero.get(rigaAi.numeroLinea)

      // Anti-allucinazione: accountId e numeroLinea devono corrispondere a
      // quelli passati nel prompt, mai fidarsi ciecamente della risposta.
      if (!rigaOriginale || !idContiValidi.has(rigaAi.accountId)) {
        logger.warn('Riga scartata dalla risposta AI: conto o numero linea non validi', {
          invoiceId,
          rigaAi,
        })
        continue
      }

      if (righeMatchate.has(rigaAi.numeroLinea)) {
        if (!rigaAi.dubbioSuMemoria) continue
        await prisma.invoiceLineAccount.update({
          where: { invoiceId_numeroLinea: { invoiceId, numeroLinea: rigaAi.numeroLinea } },
          data: { stato: 'proposta', motivazioneAi: rigaAi.motivo },
        })
      } else {
        await prisma.invoiceLineAccount.create({
          data: {
            invoiceId,
            numeroLinea: rigaOriginale.numeroLinea,
            descrizione: rigaOriginale.descrizione,
            codiceArticolo: rigaOriginale.codiceArticolo ?? null,
            importo: rigaOriginale.prezzoTotale,
            accountId: rigaAi.accountId,
            stato: 'proposta',
            fonte: 'ai',
            confidence: rigaAi.confidence,
            motivazioneAi: rigaAi.motivo,
          },
        })
      }
    }
  } catch (error) {
    logger.error('Errore nella categorizzazione delle righe fattura', error, { invoiceId })
  }
}

interface ContoCosto {
  id: string
  name: string
}

interface MemoriaFornitore {
  nomeNormalizzato: string
  codiceArticolo: string | null
  accountId: string
}

/**
 * Costruisce il prompt (user message unico): piano dei conti COSTO
 * raggruppato per categoria derivata, memorie del fornitore come few-shot, e
 * le righe fattura — marcando quelle già risolte dalla memoria.
 */
async function costruisciPrompt({
  conti,
  memorie,
  righeDaProcessare,
  righeMatchate,
}: {
  conti: ContoCosto[]
  memorie: MemoriaFornitore[]
  righeDaProcessare: DettaglioLinea[]
  righeMatchate: Map<number, { accountId: string }>
}): Promise<string> {
  const nomeConto = new Map(conti.map((c) => [c.id, c.name]))

  const categoriaPerConto = new Map<string, string | null>()
  for (const conto of conti) {
    categoriaPerConto.set(conto.id, await derivaBudgetCategoryDaConto(conto.id))
  }
  const idCategorie = [...new Set([...categoriaPerConto.values()].filter((id): id is string => !!id))]
  const categorie = idCategorie.length > 0
    ? await prisma.budgetCategory.findMany({ where: { id: { in: idCategorie } }, select: { id: true, name: true } })
    : []
  const nomeCategoria = new Map(categorie.map((c) => [c.id, c.name]))

  const gruppi = new Map<string, ContoCosto[]>()
  for (const conto of conti) {
    const categoriaId = categoriaPerConto.get(conto.id)
    const nome = categoriaId ? nomeCategoria.get(categoriaId) ?? 'Non categorizzato' : 'Non categorizzato'
    const lista = gruppi.get(nome) ?? []
    lista.push(conto)
    gruppi.set(nome, lista)
  }
  const pianoDeiConti = [...gruppi.entries()]
    .map(
      ([categoria, elenco]) =>
        `${categoria}:\n${elenco.map((c) => `- ${c.id}: ${c.name}`).join('\n')}`
    )
    .join('\n\n')

  const fewShot = memorie
    .map((m) => `- "${m.nomeNormalizzato}" → conto ${nomeConto.get(m.accountId) ?? m.accountId} (id: ${m.accountId})`)
    .join('\n')

  const righeTesto = righeDaProcessare
    .map((r) => {
      const match = righeMatchate.get(r.numeroLinea)
      const base = `Riga ${r.numeroLinea}: "${r.descrizione}"${r.codiceArticolo ? ` (codice articolo: ${r.codiceArticolo})` : ''} — importo ${r.prezzoTotale}`
      if (!match) return base
      const nomeContoAssegnato = nomeConto.get(match.accountId) ?? match.accountId
      return `${base} — GIÀ IMPUTATA dalla memoria al conto ${nomeContoAssegnato} (id: ${match.accountId}): includila nella risposta SOLO se questa imputazione ti sembra sbagliata (dubbioSuMemoria: true).`
    })
    .join('\n')

  return [
    'Sei un assistente di contabilità per un locale di ristorazione. Devi imputare le righe di una fattura fornitore ai conti del piano dei conti.',
    '',
    'Piano dei conti attivi di tipo COSTO, raggruppato per categoria di budget:',
    pianoDeiConti,
    '',
    fewShot
      ? `Memorie di questo fornitore (imputazioni già confermate in passato, usale come riferimento):\n${fewShot}`
      : 'Nessuna memoria disponibile per questo fornitore.',
    '',
    'Righe della fattura da imputare:',
    righeTesto,
    '',
    'Per ogni riga SENZA imputazione già assegnata, restituisci un conto tra quelli elencati sopra (usa esattamente il suo id), con un valore di confidence tra 0 e 1 e un motivo breve in italiano.',
    "Per le righe GIÀ imputate dalla memoria, NON includerle nella risposta a meno che l'imputazione ti sembri sbagliata: in quel caso restituiscile con dubbioSuMemoria: true e un motivo breve che spiega il dubbio.",
  ].join('\n')
}
