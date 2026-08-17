import type { Prisma } from '@prisma/client'
import { prisma, type TransactionClient } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { rispostaPerEsito } from '@/lib/banca/esiti-promozione'
import {
  promuoviRigaBancariaInTransazione,
  PromozioneRifiutata,
  type InputPromozione,
  type PromozioneInTransazione,
} from '@/lib/services/promozione-riga-bancaria-service'
import { dopoLaRiconciliazione } from '@/lib/services/schedule-reconciliation-service'
import { motivoSuperamento } from '@/lib/services/reconciliation-freshness'

/**
 * Le decisioni su una proposta di riconciliazione: approvare e scartare.
 *
 * Spec: docs/superpowers/specs/2026-08-16-riconciliazione-a2-primo-taglio-design.md,
 * decisione 3 («Approvare promuove la riga bancaria a movimento di prima
 * nota») e task 4 («Lo scarto ha due porte»); e la spec madre del 13 agosto,
 * «Cosa succede approvando» e «Lo scarto ha due porte».
 *
 * Approvare **non** crea la scrittura da sé: la crea
 * `promuoviRigaBancariaInTransazione`, il servizio unico della consegna B, lo
 * stesso da cui passano Categorizza e Collega fattura. Qui restano le sole
 * cose che riguardano la proposta: bloccarla, ricontrollare che sia ancora
 * vera, segnare chi ha deciso e quando, e spegnere le proposte concorrenti.
 *
 * Tutto in una transazione sola. Se la promozione rifiuta, la transazione cade
 * per intero: mai una proposta segnata approvata sopra una scrittura che non
 * esiste.
 *
 * Scartare è più semplice — non tocca né riga bancaria né scadenza — ma
 * condivide con l'approvazione lo stesso punto di partenza: bloccare la riga
 * bancaria e poi la proposta, rileggerla sotto lock, ed esigere che sia ancora
 * `in_attesa`. Quel pezzo vive in `bloccaEdEsigiInAttesa`, usato da entrambe.
 */

export type EsitoApprovazione =
  | { outcome: 'ok'; journalEntryId: string; reconciliationIds: string[] }
  | { outcome: 'proposta_non_trovata' }
  | { outcome: 'gia_decisa'; stato: string }
  | { outcome: 'superata'; motivo: string }
  | { outcome: 'riconciliazione_rifiutata'; motivo: string }

export interface InputApprovazione {
  proposalId: string
  venueId: string
  userId: string | null
}

/** Ciò che la transazione consegna: l'esito, più le code da eseguire fuori. */
interface ApprovazioneInTransazione {
  esito: EsitoApprovazione
  seguiti: PromozioneInTransazione['seguiti']
}

/**
 * I campi che servono a *entrambe* le decisioni una volta che la proposta è
 * bloccata: approvare legge fino allo stato delle scadenze e del movimento
 * collegato, scartare si ferma a `bankTransactionId` e alle gambe. Una select
 * sola, condivisa, invece di farne divergere due: è quella che
 * `approvaProposta` usava già prima che `bloccaEdEsigiInAttesa` esistesse, e
 * qui non cambia — scartare legge qualche colonna in più del necessario, non
 * il contrario.
 */
const SELECT_PROPOSTA_BLOCCATA = {
  id: true,
  batchId: true,
  stato: true,
  punteggio: true,
  bankTransactionId: true,
  journalEntryId: true,
  bankTransaction: { select: { status: true, deletedAt: true } },
  gambe: {
    select: {
      scheduleId: true,
      importo: true,
      schedule: {
        select: { stato: true, importoTotale: true, importoPagato: true, deletedAt: true },
      },
    },
  },
} satisfies Prisma.ReconciliationProposalSelect

type PropostaBloccata = Prisma.ReconciliationProposalGetPayload<{ select: typeof SELECT_PROPOSTA_BLOCCATA }>

type EsitoBlocco =
  | { outcome: 'trovata'; proposta: PropostaBloccata }
  | { outcome: 'proposta_non_trovata' }
  | { outcome: 'gia_decisa'; stato: string }

/**
 * Blocca la riga bancaria e poi la proposta, rilegge sotto lock, ed esige che
 * la proposta sia ancora `in_attesa`. Il pezzo comune ad approvare e
 * scartare: la differenza fra le due comincia solo dopo, con che farne di una
 * proposta trovata e ancora in attesa.
 *
 * **Prima la riga di banca, poi la proposta.** La riga è il punto di
 * serializzazione naturale: ogni decisione la tocca, e prenderla per prima
 * rende impossibile l'incrocio fra due decisioni su proposte *diverse* sulla
 * stessa riga — con l'ordine inverso una teneva la propria proposta più la
 * riga e chiedeva la rivale, mentre l'altra teneva la rivale e aspettava la
 * riga: deadlock vero (40P01), che l'utente vedrebbe come un 500.
 *
 * `promuoviRigaBancariaInTransazione` (chiamata solo da approvare) riprende
 * lo stesso lock della riga: è lecito, siamo nella stessa transazione e un
 * lock già posseduto si riprende senza attese.
 *
 * Il lock della proposta serializza due decisioni sulla *stessa* proposta: la
 * seconda entra quando la prima ha già scritto lo stato nuovo e si ferma su
 * `gia_decisa`, invece di agire due volte.
 */
async function bloccaEdEsigiInAttesa(
  tx: TransactionClient,
  proposalId: string,
  venueId: string
): Promise<EsitoBlocco> {
  // Prima lettura, senza lock: serve solo a sapere QUALE riga bancaria
  // bloccare. La sede sta sul lotto: una proposta di un'altra sede non
  // esiste, per chi chiede.
  const daBloccare = await tx.reconciliationProposal.findFirst({
    where: { id: proposalId, batch: { venueId } },
    select: { bankTransactionId: true },
  })
  if (!daBloccare) return { outcome: 'proposta_non_trovata' }

  if (daBloccare.bankTransactionId) {
    await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${daBloccare.bankTransactionId} FOR UPDATE`
  }
  await tx.$queryRaw`SELECT id FROM reconciliation_proposals WHERE id = ${proposalId} FOR UPDATE`

  // Rilettura **sotto lock**: fra la prima lettura e i due lock la proposta
  // può essere stata decisa, e le sue due parti possono essere cambiate.
  // Tutto ciò che decide da qui in giù viene da questa lettura.
  const proposta = await tx.reconciliationProposal.findFirst({
    where: { id: proposalId, batch: { venueId } },
    select: SELECT_PROPOSTA_BLOCCATA,
  })
  if (!proposta) return { outcome: 'proposta_non_trovata' }
  if (proposta.stato !== 'in_attesa') return { outcome: 'gia_decisa', stato: proposta.stato }

  return { outcome: 'trovata', proposta }
}

export async function approvaProposta(input: InputApprovazione): Promise<EsitoApprovazione> {
  const { proposalId, venueId, userId } = input

  let interno: ApprovazioneInTransazione
  try {
    interno = await prisma.$transaction(async (tx): Promise<ApprovazioneInTransazione> => {
      const blocco = await bloccaEdEsigiInAttesa(tx, proposalId, venueId)
      if (blocco.outcome !== 'trovata') return { esito: blocco, seguiti: [] }

      const proposta = blocco.proposta

      const rifiuto = motivoInapprovabile(proposta)
      if (rifiuto) {
        // Non è una decisione: la proposta resta in coda per quando la regola
        // che le manca arriverà. Perciò si esce **prima** di scrivere
        // qualunque cosa.
        return { esito: { outcome: 'riconciliazione_rifiutata', motivo: rifiuto }, seguiti: [] }
      }

      // La freschezza si ricontrolla qui dentro, con gli stessi criteri della
      // rilettura della coda: fra il momento in cui l'utente ha visto la
      // scheda e il clic su «Approva» qualcuno può aver pagato quella scadenza
      // in contanti. È il controllo che impedisce il doppio pagamento.
      const superata = motivoSuperamento(proposta)
      if (superata) {
        await tx.reconciliationProposal.update({
          where: { id: proposta.id },
          data: { stato: 'superata' },
        })
        await tx.reconciliationBatch.update({
          where: { id: proposta.batchId },
          data: { contaSuperate: { increment: 1 } },
        })
        return { esito: { outcome: 'superata', motivo: superata }, seguiti: [] }
      }

      const promozione = await promuoviRigaBancariaInTransazione(tx, {
        // `motivoInapprovabile` ha già escluso la proposta senza movimento.
        bankTransactionId: proposta.bankTransactionId!,
        venueId,
        userId,
        origine: 'proposta',
        // Il punteggio è 0-100, la confidenza 0-1: la stessa cifra, due scale.
        confidence: proposta.punteggio / 100,
        ...partiDaPromuovere(proposta),
      })

      await tx.reconciliationProposal.update({
        where: { id: proposta.id },
        data: { stato: 'approvata', decisoDaId: userId, decisoAt: new Date() },
      })

      // Le proposte concorrenti sullo stesso movimento (spec madre, «Cosa
      // succede approvando», punto 5): lo stesso denaro non può saldare due
      // scadenze diverse, e la rivale dice per mano di chi è morta.
      //
      // Le concorrenti sulla stessa *scadenza* non si toccano qui: le spegne
      // `aggiornaFreschezza` alla prossima rilettura, che ha già il conto del
      // residuo — rifarlo adesso significherebbe scrivere due volte la stessa
      // regola.
      const superate = await tx.reconciliationProposal.updateMany({
        where: {
          batchId: proposta.batchId,
          stato: 'in_attesa',
          bankTransactionId: proposta.bankTransactionId,
          id: { not: proposta.id },
        },
        data: { stato: 'superata', supersededByProposalId: proposta.id },
      })

      await tx.reconciliationBatch.update({
        where: { id: proposta.batchId },
        data: {
          contaApprovate: { increment: 1 },
          ...(superate.count > 0 ? { contaSuperate: { increment: superate.count } } : {}),
        },
      })

      return {
        esito: {
          outcome: 'ok',
          journalEntryId: promozione.esito.journalEntryId,
          reconciliationIds: promozione.esito.reconciliationIds,
        },
        seguiti: promozione.seguiti,
      }
    })
  } catch (errore) {
    // La promozione rifiuta sollevando: la transazione è già caduta per
    // intero, e qui il rifiuto diventa un esito con il messaggio che le rotte
    // della banca mostrano nel toast — uno solo, scritto in un posto solo.
    if (errore instanceof PromozioneRifiutata) {
      return {
        outcome: 'riconciliazione_rifiutata',
        motivo: String(rispostaPerEsito(errore.esito).corpo.error),
      }
    }
    throw errore
  }

  // Fuori dalla transazione: stime del fornitore, notifiche e log di ciascuna
  // gamba riconciliata. Dentro terrebbero aperta la transazione per lavoro che
  // non deve poterla far cadere.
  for (const seguito of interno.seguiti) {
    await dopoLaRiconciliazione(seguito.risultato, seguito.input)
  }

  if (interno.esito.outcome === 'ok') {
    logger.info('Proposta di riconciliazione approvata', {
      proposalId,
      journalEntryId: interno.esito.journalEntryId,
      riconciliazioni: interno.esito.reconciliationIds.length,
    })
  }

  return interno.esito
}

export type EsitoScarto =
  | { outcome: 'ok' }
  | { outcome: 'proposta_non_trovata' }
  | { outcome: 'gia_decisa'; stato: string }

export interface InputScarto {
  proposalId: string
  venueId: string
  userId: string | null
  /** true = «non propormelo mai più»: scrive anche in ReconciliationExclusion */
  perSempre: boolean
  motivo?: string
}

/**
 * Scarta una proposta: *salta per ora* (solo lo stato) o *non propormelo mai
 * più* (anche `ReconciliationExclusion`).
 *
 * Spec: «Lo scarto ha due porte». Diversamente da approvare, scartare non crea
 * né tocca nessuna scrittura — la sola cosa "vera" che nasce con `perSempre`
 * è la riga di esclusione, e serve a `generaLotto` (che già la legge, vedi
 * `leggiEsclusioni` in `reconciliation-batch-service.ts`) per non riproporre
 * la stessa coppia al prossimo lotto.
 */
export async function scartaProposta(input: InputScarto): Promise<EsitoScarto> {
  const { proposalId, venueId, userId, perSempre, motivo } = input

  return prisma.$transaction(async (tx): Promise<EsitoScarto> => {
    const blocco = await bloccaEdEsigiInAttesa(tx, proposalId, venueId)
    if (blocco.outcome !== 'trovata') return blocco

    const { proposta } = blocco

    await tx.reconciliationProposal.update({
      where: { id: proposta.id },
      data: { stato: 'scartata', decisoDaId: userId, decisoAt: new Date() },
    })
    await tx.reconciliationBatch.update({
      where: { id: proposta.batchId },
      data: { contaScartate: { increment: 1 } },
    })

    if (perSempre) {
      await scriviEsclusioniPerSempre(tx, venueId, proposta, userId, motivo)
    }

    return { outcome: 'ok' }
  })
}

/**
 * Una `ReconciliationExclusion` per ogni gamba della proposta: è la seconda
 * porta dello scarto, quella che impedisce a un lotto rigenerato di
 * riproporre lo stesso falso positivo.
 *
 * Non esiste un vincolo di unicità sulla tabella (schema,
 * `reconciliation_exclusions` ha solo `@@index([venueId, bankTransactionId])`,
 * non `@@unique`): un'esclusione già scritta per la stessa coppia non è un
 * errore — è il caso normale di chi scarta due proposte diverse che insistono
 * sulla stessa riga bancaria — quindi si verifica a mano e si salta, invece
 * di lasciare che la scrittura duplichi la riga.
 */
async function scriviEsclusioniPerSempre(
  tx: TransactionClient,
  venueId: string,
  proposta: PropostaBloccata,
  userId: string | null,
  motivo: string | undefined
): Promise<void> {
  // Le proposte della A2 hanno sempre un movimento bancario (`generaLotto` lo
  // valorizza per costruzione): il controllo resta per difesa, non per un
  // caso osservato.
  if (!proposta.bankTransactionId) return

  const scheduleIds = proposta.gambe
    .map((gamba) => gamba.scheduleId)
    .filter((id): id is string => id !== null)
  if (scheduleIds.length === 0) return

  const esistenti = await tx.reconciliationExclusion.findMany({
    where: { venueId, bankTransactionId: proposta.bankTransactionId, scheduleId: { in: scheduleIds } },
    select: { scheduleId: true },
  })
  const giaEsclusi = new Set(esistenti.map((e) => e.scheduleId))
  const daCreare = scheduleIds.filter((id) => !giaEsclusi.has(id))
  if (daCreare.length === 0) return

  await tx.reconciliationExclusion.createMany({
    data: daCreare.map((scheduleId) => ({
      venueId,
      bankTransactionId: proposta.bankTransactionId!,
      scheduleId,
      motivo: motivo ?? null,
      createdById: userId,
    })),
  })
}

/** La proposta come serve a decidere se e come si promuove. */
interface PropostaLetta {
  bankTransactionId: string | null
  journalEntryId: string | null
  gambe: Array<{ scheduleId: string | null; importo: Prisma.Decimal }>
}

/**
 * Perché questa proposta non è approvabile **per come è fatta** — a
 * prescindere da come stiano le sue due parti adesso.
 *
 * La A2 genera solo R1, R2 e R3. R4 (banca ↔ prima nota) è gestita più sotto
 * per difesa, perché costa due righe; R5 (giroconto) no: la sua gamba indica
 * un'altra riga bancaria, non una scadenza, e approvarla vorrebbe dire portare
 * a MATCHED **entrambe** le righe — un percorso che nessuno ha ancora scritto
 * né provato. Meglio dirlo che farlo a metà.
 */
function motivoInapprovabile(proposta: PropostaLetta): string | null {
  if (!proposta.bankTransactionId) {
    return 'La proposta non è legata a un movimento bancario e non è ancora approvabile'
  }
  if (proposta.gambe.some((gamba) => !gamba.scheduleId)) {
    return 'La regola R5 (giroconto) non è ancora approvabile'
  }
  if (proposta.gambe.length === 0 && !proposta.journalEntryId) {
    // Nessuna scadenza da saldare e nessuna scrittura da confermare:
    // approvarla creerebbe una scrittura che non riconcilia niente, cioè un
    // movimento di prima nota che nessuno ha chiesto.
    return 'La proposta non indica né scadenze né una scrittura da collegare'
  }
  return null
}

/**
 * Cosa si chiede alla promozione: le scadenze da saldare, e — quando la
 * proposta indica già un movimento contabile (la R4) — la scrittura da
 * confermare invece di una nuova.
 *
 * `journalEntryId` vince sempre sulla creazione, gambe o no: la spec madre
 * dice «si usa quello» (punto 1 di «Cosa succede approvando»), e senza
 * `scritturaEsistenteId` l'approvazione creerebbe una scrittura accanto a
 * quella che la proposta stessa indica — due movimenti per un solo bonifico.
 */
function partiDaPromuovere(
  proposta: PropostaLetta
): Pick<InputPromozione, 'scadenze' | 'scritturaEsistenteId'> {
  const scritturaEsistenteId = proposta.journalEntryId ?? undefined
  if (proposta.gambe.length === 0) {
    return { scritturaEsistenteId }
  }
  return {
    scritturaEsistenteId,
    scadenze: proposta.gambe.map((gamba) => ({
      // Le gambe senza scadenza (R5) sono già state fermate da
      // `motivoInapprovabile`: qui `scheduleId` c'è per costruzione.
      scheduleId: gamba.scheduleId!,
      amount: Number(gamba.importo),
    })),
  }
}
