/**
 * L'avviso che un contratto a termine sta per scadere.
 *
 * Esiste perché la data di fine, da sola, non serve a niente: nessuno apre le
 * schede dei dipendenti per controllare i termini. Il controllo gira di notte
 * e avvisa chi deve decidere del rinnovo — admin e manager, non la persona
 * interessata: è una conversazione che qualcuno deve aprire, non una notifica
 * da ricevere.
 */
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendBulkNotification } from '@/lib/notifications/send'
import { logger } from '@/lib/logger'
import {
  GIORNI_DI_PREAVVISO,
  contrattiInScadenza,
  type ContrattoInScadenza,
} from '@/lib/personale/scadenza-contratti'

export interface EsitoAvvisoContratti {
  contrattiSegnalati: number
  destinatari: number
  mailInviate: number
  /**
   * Se il canale mail è configurato. Distinto da `mailInviate`: senza questa
   * distinzione «mail inviate: 0» direbbe la stessa cosa sia quando non c'era
   * nulla da mandare sia quando il canale è spento, e un canale d'allarme che
   * tace è peggio di un canale d'allarme assente.
   */
  mailConfigurata: boolean
}

/** Il giorno civile della scadenza, per riconoscere un avviso già dato. */
function chiaveAvviso(contratto: ContrattoInScadenza): string {
  return contratto.contractEndDate.toISOString().slice(0, 10)
}

function testoAvviso(contratto: ContrattoInScadenza): { titolo: string; corpo: string } {
  const nome = `${contratto.firstName} ${contratto.lastName}`
  const quando = contratto.contractEndDate.toLocaleDateString('it-IT')

  if (contratto.giaScaduto) {
    const giorni = Math.abs(contratto.giorniMancanti)
    return {
      titolo: `Contratto scaduto — ${nome}`,
      corpo:
        `Il contratto a termine di ${nome} è scaduto il ${quando}, ` +
        `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} fa.`,
    }
  }

  if (contratto.giorniMancanti === 0) {
    return {
      titolo: `Contratto in scadenza oggi — ${nome}`,
      corpo: `Il contratto a termine di ${nome} scade oggi, ${quando}.`,
    }
  }

  return {
    titolo: `Contratto in scadenza — ${nome}`,
    corpo:
      `Il contratto a termine di ${nome} scade il ${quando}, ` +
      `fra ${contratto.giorniMancanti} ${contratto.giorniMancanti === 1 ? 'giorno' : 'giorni'}.`,
  }
}

/**
 * Guarda i contratti a termine e avvisa di quelli entro il preavviso.
 *
 * `oggi` è un parametro e non `new Date()` dentro: è ciò che rende la regola
 * verificabile senza aspettare il calendario.
 */
export async function avvisaContrattiInScadenza(
  oggi: Date = new Date()
): Promise<EsitoAvvisoContratti> {
  const mailConfigurata = Boolean(process.env.RESEND_API_KEY)

  const dipendenti = await prisma.user.findMany({
    where: { isActive: true, contractType: 'TEMPO_DETERMINATO', contractEndDate: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      contractType: true,
      contractEndDate: true,
      isActive: true,
      venueId: true,
    },
  })

  const inScadenza = contrattiInScadenza(dipendenti, oggi)
  if (inScadenza.length === 0) {
    return { contrattiSegnalati: 0, destinatari: 0, mailInviate: 0, mailConfigurata }
  }

  // Chi decide del rinnovo. La persona interessata non è fra i destinatari.
  const responsabili = await prisma.user.findMany({
    where: { isActive: true, role: { name: { in: ['admin', 'manager'] } } },
    select: { id: true, email: true },
  })
  if (responsabili.length === 0) {
    logger.warn('Contratti in scadenza ma nessun admin o manager a cui dirlo')
    return { contrattiSegnalati: 0, destinatari: 0, mailInviate: 0, mailConfigurata }
  }

  // Un contratto resta in scadenza per tutte le notti del preavviso: senza
  // questo controllo l'avviso arriverebbe quindici volte e si imparerebbe a
  // ignorarlo. La chiave è la data di fine, così un rinnovo — che quella data
  // la sposta — torna a essere segnalato a suo tempo.
  const giaAvvisati = await prisma.notificationLog.findMany({
    where: {
      type: 'CONTRACT_EXPIRING',
      referenceId: { in: inScadenza.map((c) => c.id) },
    },
    select: { referenceId: true, data: true },
  })
  const chiaviNote = new Set(
    giaAvvisati.map((a) => `${a.referenceId}:${(a.data as { scadenza?: string })?.scadenza ?? ''}`)
  )

  const daSegnalare = inScadenza.filter(
    (c) => !chiaviNote.has(`${c.id}:${chiaveAvviso(c)}`)
  )
  if (daSegnalare.length === 0) {
    return { contrattiSegnalati: 0, destinatari: 0, mailInviate: 0, mailConfigurata }
  }

  for (const contratto of daSegnalare) {
    const { titolo, corpo } = testoAvviso(contratto)

    // La via ordinaria delle notifiche dell'applicazione: manda il push,
    // rispetta le preferenze di chi lo riceve e lascia la riga che alimenta
    // la campanella in-app — la stessa riga che qui sopra serve a non
    // ripetere l'avviso ogni notte.
    await sendBulkNotification({
      userIds: responsabili.map((r) => r.id),
      payload: {
        type: 'CONTRACT_EXPIRING',
        title: titolo,
        body: corpo,
        url: `/staff/${contratto.id}`,
        referenceId: contratto.id,
        referenceType: 'User',
        // `data` viaggia fino al service worker: i valori sono stringhe.
        data: {
          scadenza: chiaveAvviso(contratto),
          giorniMancanti: String(contratto.giorniMancanti),
        },
      },
    })
  }

  let mailInviate = 0
  if (mailConfigurata) {
    const righe = daSegnalare.map((c) => testoAvviso(c).corpo)
    const titolo =
      daSegnalare.length === 1
        ? testoAvviso(daSegnalare[0]).titolo
        : `${daSegnalare.length} contratti a termine in scadenza`

    for (const responsabile of responsabili) {
      if (!responsabile.email) continue
      const inviata = await sendEmail({
        to: responsabile.email,
        subject: titolo,
        html:
          `<p>Contratti a termine da rivedere (preavviso di ${GIORNI_DI_PREAVVISO} giorni):</p>` +
          `<ul>${righe.map((r) => `<li>${r}</li>`).join('')}</ul>`,
      })
      if (inviata) mailInviate += 1
    }
  }

  return {
    contrattiSegnalati: daSegnalare.length,
    destinatari: responsabili.length,
    mailInviate,
    mailConfigurata,
  }
}
