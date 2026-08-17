/**
 * L'avviso che la sincronizzazione bancaria è fallita.
 *
 * Esiste perché il cron gira di notte, quando non c'è nessuno a guardare — la
 * stessa forma di rischio dell'errore già commesso in quest'area: il rinnovo del
 * consenso scriveva la data di validità *prima* che l'autenticazione riuscisse,
 * e così spegneva proprio l'avviso che avrebbe segnalato il problema.
 */
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

/**
 * Notti consecutive prima di mandare la mail.
 *
 * Il campanello si accende a ogni fallimento; la mail no. Un errore isolato
 * della banca è frequente, e una notifica che si impara a ignorare smette di
 * funzionare proprio quando servirebbe.
 */
export const NOTTI_PRIMA_DELLA_MAIL = 2

export interface EsitoAvviso {
  /** Quante righe sono finite sul campanello. */
  campanello: number
  mailInviata: boolean
  /**
   * Se il canale mail è configurato. **Distinto da `mailInviata`**: senza
   * questa distinzione il pannello direbbe «mail inviata: no» sia quando è
   * tutto a posto (primo fallimento, la mail non andava mandata) sia quando il
   * canale è spento. Un canale d'allarme che tace è peggio di un canale
   * d'allarme assente, perché chi lo guarda crede di essere coperto.
   */
  mailConfigurata: boolean
}

export interface ArgomentiAvviso {
  venueId: string
  nomeConto: string
  errore: string
  fallimentiConsecutivi: number
}

export async function avvisaSyncFallita(args: ArgomentiAvviso): Promise<EsitoAvviso> {
  // Letta qui e non a livello di modulo: una costante di modulo renderebbe i
  // test dipendenti dall'ordine, perché la cambiano fra un caso e l'altro.
  const mailConfigurata = Boolean(process.env.RESEND_API_KEY)

  const admin = await prisma.user.findMany({
    where: { venueId: args.venueId, isActive: true, role: { name: 'admin' } },
    select: { id: true, email: true },
  })

  const titolo = `Sincronizzazione bancaria fallita — ${args.nomeConto}`
  const corpo =
    `Il conto «${args.nomeConto}» non si è sincronizzato: ${args.errore}. ` +
    `Fallimenti consecutivi: ${args.fallimentiConsecutivi}.`

  await prisma.notificationLog.createMany({
    data: admin.map((u) => ({
      userId: u.id,
      type: 'BANK_SYNC_FAILED' as const,
      title: titolo,
      body: corpo,
      channel: 'IN_APP' as const,
      status: 'SENT' as const,
    })),
  })

  const vaMandata = args.fallimentiConsecutivi >= NOTTI_PRIMA_DELLA_MAIL
  if (!vaMandata || !mailConfigurata) {
    if (vaMandata && !mailConfigurata) {
      logger.error('[SyncBancaria] Mail non inviata: RESEND_API_KEY non configurata', {
        conto: args.nomeConto,
      })
    }
    return { campanello: admin.length, mailInviata: false, mailConfigurata }
  }

  const destinatari = admin.map((u) => u.email).filter((e): e is string => Boolean(e))
  if (destinatari.length === 0) {
    logger.error('[SyncBancaria] Nessun admin con indirizzo email', { conto: args.nomeConto })
    return { campanello: admin.length, mailInviata: false, mailConfigurata }
  }

  // `sendEmail` restituisce `false` invece di sollevare: il valore va guardato,
  // altrimenti l'esito riportato al pannello sarebbe un'illusione.
  const esiti = await Promise.all(
    destinatari.map((to) =>
      sendEmail({
        to,
        subject: titolo,
        html: `<p>${corpo}</p>`,
      })
    )
  )

  return {
    campanello: admin.length,
    mailInviata: esiti.some(Boolean),
    mailConfigurata,
  }
}
