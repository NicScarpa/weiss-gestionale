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
import { giorni } from '@/lib/gocardless/parametri'

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
 *
 * Un array vuoto è memoria valida quanto uno pieno: un consenso che copre
 * zero conti (banca senza conti da esporre, o tutti già ignorati a monte) è
 * un esito legittimo della lettura, non un «non ho ancora letto». A
 * distinguere «mai letto» da «letto e vuoto» ci pensa già `contiLettiIl`, che
 * qui sotto è `null` solo nel primo caso: la lunghezza dell'array non serve.
 */
function leggiConservati(valore: unknown): ContoConservato[] | null {
  const esito = z.array(contoConservatoSchema).safeParse(valore)
  return esito.success ? esito.data : null
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
          const aggiornamentoStato: Prisma.BankConnectionUpdateInput = { status: stato }
          if (stato === 'LN') {
            // Il momento giusto per scrivere `accessValidUntil`: qui il
            // consenso è davvero concesso, non solo richiesto. Scriverla già
            // in POST /collegamenti o POST /rinnovo (che infatti non la
            // scrive più: vedi il commento in testa a quel file) farebbe
            // sembrare valido un consenso per cui l'autenticazione in banca
            // non è mai stata completata — l'evento più ordinario di questa
            // integrazione (OTP sbagliato, app scaduta, scheda chiusa).
            //
            // Un `try/catch` tutto suo: questa chiamata è un arricchimento,
            // non l'essenziale. `istituzioni()` non è per conto, quindi non
            // tocca il contingente su cui vale la guardia di `dettagliConto`
            // qui sotto, ma sta nella stessa catena `await` che scrive lo
            // stato — un 429 o un 5xx qui non deve far fallire l'intera
            // lettura dei conti proprio quando l'amministratore torna dalla
            // banca. Se fallisce, lo stato si scrive lo stesso e la data
            // resta indietro fino alla prossima lettura che ci riesce.
            try {
              const elenco = await client.istituzioni('it')
              const istituto = elenco.dati.find((i) => i.id === connessione.institutionId)
              // Un istituto sparito dal catalogo non deve produrre una
              // scadenza inventata: la stessa condizione, in POST /rinnovo,
              // risponde con un 409 esplicito. Qui la conseguenza sarebbe
              // invisibile — una data a schermo indistinguibile da una vera
              // — quindi si tratta come «non ho l'informazione»: si lascia
              // `accessValidUntil` com'era, non si scrivono 90 giorni per
              // difetto.
              if (istituto) {
                const accesso = Math.min(giorni(istituto.max_access_valid_for_days, 90), 180)
                aggiornamentoStato.accessValidUntil = new Date(Date.now() + accesso * 86_400_000)
              }
            } catch {
              // Nessuna scadenza scritta: si riprova alla prossima lettura.
            }
          }
          await prisma.bankConnection.update({ where: { id: connessione.id }, data: aggiornamentoStato })
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

      // Serve più sotto, per il controllo sull'impronta: la stessa lettura
      // che la GET usa per abbinare a schermo. `null` quando la memoria non
      // è ancora stata scritta — in quel caso il controllo si salta, non
      // rifiuta tutto (non c'è nulla con cui confrontare).
      const conservati = leggiConservati(connessione.contiLetti)

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

      // Speculare al controllo sopra, sul verso opposto: due voci con
      // `providerAccountId` diversi (quindi non fermate lì) possono scegliere
      // lo stesso `bankAccountId`. Passerebbero entrambe la validazione per
      // riga qui sotto e scriverebbero la stessa riga di `BankAccount` due
      // volte nella stessa transazione — vince l'ultima, `salvati` ne conta
      // comunque due, e nessuno saprebbe quale configurazione è davvero in
      // vigore.
      const conteggioBankAccountId = new Map<string, number>()
      for (const c of analisi.data.conti) {
        if (c.azione !== 'configura' || !c.bankAccountId) continue
        conteggioBankAccountId.set(c.bankAccountId, (conteggioBankAccountId.get(c.bankAccountId) ?? 0) + 1)
      }
      const bankAccountIdDuplicato = [...conteggioBankAccountId.entries()].find(([, n]) => n > 1)
      if (bankAccountIdDuplicato) {
        return NextResponse.json(
          { error: `Il conto del gestionale ${bankAccountIdDuplicato[0]} è scelto da più righe nella stessa richiesta` },
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
        const contoDelGestionale = await prisma.bankAccount.findFirst({
          where: { id: c.bankAccountId, venueId, accountType: 'BANK' },
          select: { providerAccountId: true, isActive: true, ibanHash: true },
        })
        if (!contoDelGestionale) {
          return NextResponse.json({ error: 'Conto del gestionale inesistente' }, { status: 400 })
        }
        // Un conto archiviato non è più fra quelli proposti dalla GET (che
        // non filtra su `isActive`, ma la pagina nasconde gli archiviati a
        // meno che «Mostra archiviati» sia acceso): accenderlo qui lo
        // renderebbe destinazione di movimenti bancari mentre resta invisibile
        // alle operazioni quotidiane.
        if (!contoDelGestionale.isActive) {
          return NextResponse.json(
            { error: `Il conto del gestionale scelto per ${c.providerAccountId} è archiviato: riattivalo prima di abbinarlo` },
            { status: 400 }
          )
        }
        // Il pannello abbina per impronta dell'IBAN, la sincronizzazione userà
        // `providerAccountId`: se il conto del gestionale è già legato a un
        // ALTRO conto banca, sovrascriverlo farebbe divergere ciò che il
        // pannello continua a mostrare (l'abbinamento per impronta, rifatto
        // alla lettura successiva) da ciò che la banca dati userà davvero per
        // sincronizzare. Riscrivere lo stesso conto banca sullo stesso
        // abbinamento resta permesso: è solo un cambio di data o interruttore.
        if (
          contoDelGestionale.providerAccountId &&
          contoDelGestionale.providerAccountId !== c.providerAccountId
        ) {
          return NextResponse.json(
            {
              error: `Il conto del gestionale scelto per ${c.providerAccountId} è già abbinato a un altro conto della banca (${contoDelGestionale.providerAccountId})`,
            },
            { status: 400 }
          )
        }
        // Il controllo sopra guarda la colonna SALVATA, che per un conto
        // abbinato solo per impronta — mostrato «riconosciuto» dalla GET, ma
        // mai passato da un «Salva» — è vuota: non basta da solo. Se il
        // conto del gestionale scelto ha la stessa impronta di un conto
        // della banca DIVERSO da quello che si sta salvando, salvare
        // comunque farebbe divergere ciò che la lettura successiva
        // riabbina per impronta (mostrato a schermo) da ciò che la colonna
        // dice davvero. Senza `conservati` (memoria mai scritta) non c'è
        // nulla con cui confrontare, e un conto senza impronta propria non
        // corrisponde a niente: in entrambi i casi il controllo si salta.
        if (conservati && contoDelGestionale.ibanHash) {
          const corrispondente = conservati.find((conto) => conto.ibanHash === contoDelGestionale.ibanHash)
          if (corrispondente && corrispondente.providerAccountId !== c.providerAccountId) {
            return NextResponse.json(
              {
                error: `Il conto del gestionale scelto per ${c.providerAccountId} corrisponde per IBAN al conto ${corrispondente.ibanMascherato ?? corrispondente.providerAccountId} della banca: abbinalo a quello, oppure scegli un altro conto del gestionale`,
              },
              { status: 400 }
            )
          }
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
