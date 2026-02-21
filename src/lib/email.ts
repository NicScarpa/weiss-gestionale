import { Resend } from 'resend'
import { logger } from './logger'

// Inizializza Resend solo se la chiave API è configurata
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

// Email del mittente (deve essere verificato in Resend)
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@weisscafe.com'
const APP_NAME = 'Weiss Cafè'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Invia un'email usando Resend
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  if (!resend) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[Email] RESEND_API_KEY non configurata in produzione - email non inviata', { to, subject })
    } else {
      logger.warn('[Email] Resend non configurato - email non inviata', { to, subject })
      logger.info('[Email] Mock email:', { to, subject, html })
    }
    return false
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Fallback text
    })

    if (error) {
      logger.error('[Email] Errore invio email', { error, to, subject })
      return false
    }

    logger.info('[Email] Email inviata con successo', { id: data?.id, to, subject })
    return true
  } catch (error) {
    logger.error('[Email] Eccezione durante invio email', { error, to, subject })
    return false
  }
}

/**
 * Invia email per recupero password
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  username: string
): Promise<boolean> {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000'
  const resetUrl = `${appUrl}/reset-password?token=${token}`

  // Token valido per 1 ora
  const expiryMinutes = 60

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recupero Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">${APP_NAME}</h1>
    <p style="color: #ccc; margin: 10px 0 0 0; font-size: 14px;">Sistema Gestionale</p>
  </div>

  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Recupero Password</h2>

    <p>Ciao <strong>${username}</strong>,</p>

    <p>Abbiamo ricevuto una richiesta di recupero password per il tuo account. Se non hai richiesto tu il reset, puoi ignorare questa email.</p>

    <p>Per reimpostare la tua password, clicca sul pulsante qui sotto:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}"
         style="background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        Reimposta Password
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">
      Oppure copia e incolla questo link nel tuo browser:<br>
      <a href="${resetUrl}" style="color: #0066cc; word-break: break-all;">${resetUrl}</a>
    </p>

    <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin-top: 20px;">
      <p style="margin: 0; font-size: 13px; color: #856404;">
        <strong>Attenzione:</strong> Questo link scade tra <strong>${expiryMinutes} minuti</strong>.
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; margin-bottom: 0;">
      Questa email è stata inviata automaticamente da ${APP_NAME}.<br>
      Se non hai richiesto il reset della password, puoi ignorare questa email in sicurezza.
    </p>
  </div>
</body>
</html>
`

  const text = `
Ciao ${username},

Abbiamo ricevuto una richiesta di recupero password per il tuo account ${APP_NAME}.

Per reimpostare la tua password, visita questo link:
${resetUrl}

Attenzione: Questo link scade tra ${expiryMinutes} minuti.

Se non hai richiesto il reset della password, puoi ignorare questa email.

--
${APP_NAME}
`

  return sendEmail({
    to: email,
    subject: `${APP_NAME} - Recupero Password`,
    html,
    text,
  })
}
