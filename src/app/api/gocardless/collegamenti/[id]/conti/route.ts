/**
 * I conti che il consenso copre, e le decisioni dell'amministratore su ognuno.
 *
 * Tre azioni possibili, e nessuna è il default:
 *  - `configura` accende o spegne il conto (`attivo`); richiede sempre un
 *                conto del gestionale e una data di taglio, anche da spento —
 *                è la data con cui ripartirà quando verrà riacceso. Spegnere
 *                non è ignorare: un conto spento resta abbinato, pronto a
 *                essere riacceso;
 *  - `ignora`    lo mette nella lista dei conti che il pannello non chiederà
 *                più (tipicamente un conto personale);
 *  - `lascia`    non fa niente, ed è quello che succede se non si decide.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { lookupHash } from '@/lib/encryption'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { rispostaErroreGoCardless } from '@/lib/gocardless/risposte'
import { descriviStato, eCollegata } from '@/lib/gocardless/stati'
import { abbinaConti, type ContoDaBanca } from '@/lib/gocardless/abbinamento'
import { mascheraIban } from '@/lib/gocardless/maschere'

const corpoSalvataggio = z.object({
  conti: z.array(
    z.object({
      providerAccountId: z.string().min(1),
      azione: z.enum(['configura', 'ignora', 'lascia']),
      bankAccountId: z.string().optional(),
      /** `YYYY-MM-DD`. Obbligatoria solo per `configura`. */
      dataTaglio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      /**
       * Se il conto deve sincronizzare. Spegnere non è ignorare: un conto
       * spento resta abbinato, con la sua data, pronto a essere riacceso;
       * un conto ignorato è un conto che non vogliamo più vedere proposto.
       */
      attivo: z.boolean().optional(),
    })
  ),
})

/** Ciò che si conserva di un conto letto: mai l'IBAN, solo impronta e maschera. */
export interface ContoConservato {
  providerAccountId: string
  ibanHash: string | null
  ibanMascherato: string | null
  intestatario: string | null
  valuta: string | null
}

const contoConservatoSchema = z.object({
  providerAccountId: z.string(),
  ibanHash: z.string().nullable(),
  ibanMascherato: z.string().nullable(),
  intestatario: z.string().nullable(),
  valuta: z.string().nullable(),
})

/**
 * Rilegge la colonna, o `null` se la forma non torna. Una colonna JSON scritta
 * da una versione precedente del codice non deve far esplodere il pannello:
 * peggio che perdere la memoria è mostrare un errore per averla.
 */
function leggiConservati(valore: unknown): ContoConservato[] | null {
  const esito = z.array(contoConservatoSchema).safeParse(valore)
  return esito.success && esito.data.length > 0 ? esito.data : null
}

/** Un conto conservato, nella forma che l'abbinamento si aspetta. */
function daConservato(c: ContoConservato): ContoDaBanca {
  return {
    providerAccountId: c.providerAccountId,
    iban: null,
    ibanHash: c.ibanHash,
    intestatario: c.intestatario,
    valuta: c.valuta,
  }
}

async function connessioneDellaSede(id: string, venueId: string) {
  return prisma.bankConnection.findFirst({ where: { id, venueId, deletedAt: null } })
}

/**
 * `YYYY-MM-DD` sintatticamente valido non è una data che esiste: `new
 * Date('2026-02-30...')` non lancia, normalizza in silenzio al primo marzo.
 * Si ricostruiscono i tre componenti e si confrontano con quelli scritti:
 * se il motore li ha corretti, la data non esisteva.
 */
function dataDiTaglioValida(valore: string): boolean {
  const [anno, mese, giorno] = valore.split('-').map(Number)
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno
}

export const GET = withAuth<{ id: string }>(
  async (request, { venueId, params }) => {
    try {
      const connessione = await connessioneDellaSede(params.id, venueId)
      if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

      const aggiorna = new URL(request.url).searchParams.get('aggiorna') === '1'
      const conservati = leggiConservati(connessione.contiLetti)

      let stato = connessione.status
      let contiBanca: ContoDaBanca[]
      // In portata anche dopo il ramo: la maschera del percorso di
      // aggiornamento vive qui, non in `conservati` (che lì è `null`). `const`
      // e non `let`: si muta con `.push`, non si riassegna mai il binding.
      const letti: ContoConservato[] = []

      if (conservati && !aggiorna) {
        contiBanca = conservati.map(daConservato)
      } else {
        const client = clientDaAmbiente()
        const requisition = await client.leggiRequisition(connessione.requisitionId)
        stato = requisition.dati.status

        if (connessione.status !== stato) {
          await prisma.bankConnection.update({ where: { id: connessione.id }, data: { status: stato } })
        }

        if (!eCollegata(stato)) {
          return NextResponse.json({
            stato: descriviStato(stato),
            conti: [],
            lettiIl: connessione.contiLettiIl?.toISOString() ?? null,
          })
        }

        // I dettagli si chiedono un conto alla volta: è l'API a non avere una
        // lettura in blocco. Sono chiamate contate contro il limite giornaliero
        // (una per la requisition, più una per conto): questa è la rotta più
        // costosa della fase, ed è per questo che il risultato si conserva
        // invece di richiederlo a ogni apertura del pannello.
        for (const id of requisition.dati.accounts) {
          const dettagli = await client.dettagliConto(id)
          const iban = dettagli.dati.account.iban ?? null
          letti.push({
            providerAccountId: id,
            // L'IBAN non si conserva: solo l'impronta, che serve ad abbinare, e
            // la maschera, che serve a mostrarlo. Il valore non serve a nessuno
            // dei due, e conservarlo lo metterebbe in chiaro accanto a una
            // colonna che il middleware cifra.
            ibanHash: iban ? lookupHash(iban) : null,
            ibanMascherato: iban ? mascheraIban(iban) : null,
            intestatario: dettagli.dati.account.ownerName ?? null,
            valuta: dettagli.dati.account.currency ?? null,
          })
        }
        contiBanca = letti.map(daConservato)

        // Solo una lettura riuscita per intero merita di essere ricordata:
        // una memoria parziale (metà conti, per un errore a metà giro) sarebbe
        // peggio di nessuna memoria, perché il pannello la crederebbe completa.
        await prisma.bankConnection.update({
          where: { id: connessione.id },
          data: { contiLetti: letti as unknown as Prisma.InputJsonValue, contiLettiIl: new Date() },
        })
      }

      const contiGestionale = (
        await prisma.bankAccount.findMany({
          where: { venueId, accountType: 'BANK' },
          select: { id: true, name: true, ibanHash: true, connectionId: true },
        })
      ).map((c) => ({
        id: c.id,
        nome: c.name,
        ibanHash: c.ibanHash,
        // Legato a QUESTA connessione non è «già collegato altrove»: è la
        // configurazione che stiamo rileggendo.
        connectionId: c.connectionId === connessione.id ? null : c.connectionId,
      }))

      const abbinati = abbinaConti({
        contiBanca,
        contiGestionale,
        ignorati: connessione.contiIgnorati,
        impronta: lookupHash,
      })

      // La data dell'ultimo movimento che il gestionale possiede per ciascun
      // conto riconosciuto. Non è un valore da precompilare — la data di
      // taglio la sceglie l'amministratore — ma è il numero che gli serve
      // davanti per sceglierla: senza, deciderebbe a memoria.
      const idRiconosciuti = abbinati
        .filter((a) => a.tipo === 'riconosciuto' || a.tipo === 'gia-collegato')
        .map((a) => (a as { bankAccountId: string }).bankAccountId)

      const ultimi = new Map<string, string>()
      if (idRiconosciuti.length > 0) {
        const righe = await prisma.bankTransaction.groupBy({
          by: ['bankAccountId'],
          where: { bankAccountId: { in: idRiconosciuti }, deletedAt: null },
          _max: { transactionDate: true },
        })
        for (const r of righe) {
          const quando = r._max.transactionDate
          if (r.bankAccountId && quando) ultimi.set(r.bankAccountId, quando.toISOString().slice(0, 10))
        }
      }

      // `conservati` è null sul percorso di aggiornamento, dove le maschere sono
      // in `letti`: si prende quello che c'è, e in entrambi i casi si indicizza.
      const maschere = new Map((conservati ?? letti).map((c) => [c.providerAccountId, c.ibanMascherato]))

      // Quali conti, fra quelli già legati a QUESTA connessione, sono accesi e
      // con quale data: senza, il pannello ripresenterebbe vuoto un campo che
      // l'amministratore aveva già compilato.
      //
      // `accountType: 'BANK'` come nelle altre due letture di questo file:
      // `bank_accounts` contiene anche le casse, e in questa integrazione
      // leggerla senza filtrare è già stato l'errore due volte. Oggi nessuna
      // cassa può avere `connectionId` valorizzato — solo la PUT qui sotto lo
      // scrive, e prima impone BANK — quindi il filtro non cambia nulla: è la
      // rete perché non cambi nulla nemmeno se un domani qualcos'altro
      // scrivesse quella colonna.
      const configurazioni = new Map(
        (
          await prisma.bankAccount.findMany({
            where: { venueId, connectionId: connessione.id, accountType: 'BANK' },
            select: { id: true, syncEnabled: true, syncCutoffDate: true },
          })
        ).map((c) => [c.id, c])
      )

      return NextResponse.json({
        stato: descriviStato(stato),
        conti: abbinati.map((a) => {
          const ibanMascherato = maschere.get(a.conto.providerAccountId) ?? null
          if ('bankAccountId' in a) {
            const configurazione = configurazioni.get(a.bankAccountId)
            return {
              ...a,
              ibanMascherato,
              ultimoMovimento: ultimi.get(a.bankAccountId) ?? null,
              syncEnabled: configurazione?.syncEnabled ?? false,
              syncCutoffDate: configurazione?.syncCutoffDate
                ? configurazione.syncCutoffDate.toISOString().slice(0, 10)
                : null,
            }
          }
          return { ...a, ibanMascherato, ultimoMovimento: null, syncEnabled: false, syncCutoffDate: null }
        }),
        lettiIl: connessione.contiLettiIl?.toISOString() ?? null,
      })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'GET /api/gocardless/collegamenti/[id]/conti')
    }
  },
  { roles: ['admin'], venueScoped: true }
)

export const PUT = withAuth<{ id: string }>(
  async (request, { venueId, params }) => {
    try {
      const connessione = await connessioneDellaSede(params.id, venueId)
      if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

      const analisi = corpoSalvataggio.safeParse(await request.json().catch(() => null))
      if (!analisi.success) return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 })

      // Si valida tutto prima di scrivere qualsiasi cosa: metà configurazione
      // salvata è peggio di nessuna, perché sembra riuscita.

      // Due voci sullo stesso conto banca, con azioni in conflitto, non hanno
      // un vincitore sensato da dedurre: nella stessa transazione vince
      // l'ultima scritta, e se è `ignora` dopo un `configura` il conto resta
      // acceso ma sparisce dal pannello — irraggiungibile per spegnerlo.
      // Si rifiuta il corpo, non si sceglie per l'amministratore.
      const conteggio = new Map<string, number>()
      for (const c of analisi.data.conti) {
        conteggio.set(c.providerAccountId, (conteggio.get(c.providerAccountId) ?? 0) + 1)
      }
      const duplicato = [...conteggio.entries()].find(([, n]) => n > 1)
      if (duplicato) {
        return NextResponse.json(
          { error: `Il conto ${duplicato[0]} compare più di una volta nella richiesta, con azioni in conflitto` },
          { status: 400 }
        )
      }

      for (const c of analisi.data.conti) {
        if (c.azione !== 'configura') continue
        if (!c.bankAccountId) {
          return NextResponse.json({ error: `Il conto ${c.providerAccountId} è da configurare ma non è abbinato` }, { status: 400 })
        }
        if (!c.dataTaglio) {
          return NextResponse.json({ error: `Il conto ${c.providerAccountId} è da configurare ma non ha una data di taglio` }, { status: 400 })
        }
        if (!dataDiTaglioValida(c.dataTaglio)) {
          return NextResponse.json(
            { error: `Il conto ${c.providerAccountId} ha una data di taglio che non esiste (${c.dataTaglio})` },
            { status: 400 }
          )
        }
        // `accountType: 'BANK'`: la lettura propone come candidati solo i
        // conti bancari, e la scrittura deve rifiutare lo stesso l'id di una
        // cassa — altrimenti la si trasforma in un conto sincronizzato. È la
        // stessa tabella che nella Fase 1 aveva già morso per lo stesso
        // motivo, sul backfill.
        const esiste = await prisma.bankAccount.count({
          where: { id: c.bankAccountId, venueId, accountType: 'BANK' },
        })
        if (esiste === 0) {
          return NextResponse.json({ error: 'Conto del gestionale inesistente' }, { status: 400 })
        }
      }

      const ignorati = new Set(connessione.contiIgnorati)
      let salvati = 0

      await prisma.$transaction(async (tx) => {
        for (const c of analisi.data.conti) {
          if (c.azione === 'ignora') {
            ignorati.add(c.providerAccountId)
            // Ignorare deve anche disfare un'eventuale accensione precedente: la
            // variante 'ignorato' non porta bankAccountId, quindi un conto acceso e
            // ignorato non sarebbe più raggiungibile dal pannello per spegnerlo.
            await tx.bankAccount.updateMany({
              where: { connectionId: connessione.id, providerAccountId: c.providerAccountId },
              data: { syncEnabled: false, connectionId: null, providerAccountId: null },
            })
            salvati++
            continue
          }
          if (c.azione === 'lascia') continue

          ignorati.delete(c.providerAccountId)
          await tx.bankAccount.update({
            where: { id: c.bankAccountId! },
            data: {
              providerAccountId: c.providerAccountId,
              connectionId: connessione.id,
              syncEnabled: c.attivo ?? true,
              syncCutoffDate: new Date(`${c.dataTaglio}T00:00:00.000Z`),
            },
          })
          salvati++
        }

        await tx.bankConnection.update({
          where: { id: connessione.id },
          data: { contiIgnorati: [...ignorati] },
        })
      })

      return NextResponse.json({ salvati })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'PUT /api/gocardless/collegamenti/[id]/conti')
    }
  },
  { roles: ['admin'], venueScoped: true }
)
