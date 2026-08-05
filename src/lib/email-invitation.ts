import { sendEmail } from './email'

const APP_NAME = 'Weiss Cafè'
const INVITE_EXPIRY_DAYS = 7

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    'http://localhost:3000'
  )
}

interface StaffInvitationEmailParams {
  email: string
  token: string
  firstName?: string | null
  invitedByName?: string | null
}

/**
 * Invia email di invito per registrazione staff (nuovo dipendente senza account)
 */
export async function sendStaffInvitationEmail({
  email,
  token,
  firstName,
  invitedByName,
}: StaffInvitationEmailParams): Promise<boolean> {
  const inviteUrl = `${getAppUrl()}/invito?token=${token}`
  const greeting = firstName?.trim() ? `Ciao <strong>${firstName.trim()}</strong>,` : 'Ciao,'
  const greetingText = firstName?.trim() ? `Ciao ${firstName.trim()},` : 'Ciao,'
  const inviterLabel = invitedByName?.trim() || 'Il team Weiss'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invito al portale del team</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">${APP_NAME}</h1>
    <p style="color: #ccc; margin: 10px 0 0 0; font-size: 14px;">Sistema Gestionale</p>
  </div>

  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Sei stato invitato al portale del team</h2>

    <p>${greeting}</p>

    <p><strong>${inviterLabel}</strong> ti ha invitato al portale del team ${APP_NAME}. Completa la registrazione e imposta la tua password per accedere a turni, timbrature, ferie e documenti.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}"
         style="background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        Imposta la password
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">
      Oppure copia e incolla questo link nel tuo browser:<br>
      <a href="${inviteUrl}" style="color: #0066cc; word-break: break-all;">${inviteUrl}</a>
    </p>

    <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin-top: 20px;">
      <p style="margin: 0; font-size: 13px; color: #856404;">
        <strong>Attenzione:</strong> Questo link scade tra <strong>${INVITE_EXPIRY_DAYS} giorni</strong>.
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; margin-bottom: 0;">
      Questa email è stata inviata automaticamente da ${APP_NAME}.<br>
      Se non ti aspettavi questo invito, puoi ignorare questa email in sicurezza.
    </p>
  </div>
</body>
</html>
`

  const text = `
${greetingText}

${inviterLabel} ti ha invitato al portale del team ${APP_NAME}.

Per completare la registrazione e impostare la tua password, visita questo link:
${inviteUrl}

Attenzione: Questo link scade tra ${INVITE_EXPIRY_DAYS} giorni.

Se non ti aspettavi questo invito, puoi ignorare questa email.

--
${APP_NAME}
`

  return sendEmail({
    to: email,
    subject: `${APP_NAME} - Sei stato invitato al portale del team`,
    html,
    text,
  })
}

interface PortalAccessEmailParams {
  email: string
  token: string
  firstName?: string | null
  invitedByName?: string | null
}

/**
 * Invia l'invito al portale a un dipendente che ha già un account nel sistema.
 *
 * A differenza di sendStaffInvitationEmail (che porta alla registrazione di un nuovo
 * utente), qui il link punta al reset password: l'account esiste già e il dipendente
 * deve solo impostare la propria password per accedere al portale.
 */
export async function sendPortalAccessEmail({
  email,
  token,
  firstName,
  invitedByName,
}: PortalAccessEmailParams): Promise<boolean> {
  const resetUrl = `${getAppUrl()}/reset-password?token=${token}`
  const greeting = firstName?.trim() ? `Ciao <strong>${firstName.trim()}</strong>,` : 'Ciao,'
  const greetingText = firstName?.trim() ? `Ciao ${firstName.trim()},` : 'Ciao,'
  const inviterLabel = invitedByName?.trim() || 'Il team Weiss'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invito al portale del team</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">${APP_NAME}</h1>
    <p style="color: #ccc; margin: 10px 0 0 0; font-size: 14px;">Sistema Gestionale</p>
  </div>

  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Sei stato invitato al portale del team</h2>

    <p>${greeting}</p>

    <p><strong>${inviterLabel}</strong> ti ha abilitato l'accesso al portale del team ${APP_NAME}. Imposta la tua password per consultare turni, timbrature, ferie e documenti.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}"
         style="background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        Imposta la password
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">
      Oppure copia e incolla questo link nel tuo browser:<br>
      <a href="${resetUrl}" style="color: #0066cc; word-break: break-all;">${resetUrl}</a>
    </p>

    <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin-top: 20px;">
      <p style="margin: 0; font-size: 13px; color: #856404;">
        <strong>Attenzione:</strong> Questo link scade tra <strong>${INVITE_EXPIRY_DAYS} giorni</strong>.
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; margin-bottom: 0;">
      Questa email è stata inviata automaticamente da ${APP_NAME}.<br>
      Se non ti aspettavi questo invito, puoi ignorare questa email in sicurezza.
    </p>
  </div>
</body>
</html>
`

  const text = `
${greetingText}

${inviterLabel} ti ha abilitato l'accesso al portale del team ${APP_NAME}.

Per impostare la tua password, visita questo link:
${resetUrl}

Attenzione: Questo link scade tra ${INVITE_EXPIRY_DAYS} giorni.

Se non ti aspettavi questo invito, puoi ignorare questa email.

--
${APP_NAME}
`

  return sendEmail({
    to: email,
    subject: `${APP_NAME} - Sei stato invitato al portale del team`,
    html,
    text,
  })
}

/** Giorni di validità dei link di invito (usato anche dalle route API) */
export { INVITE_EXPIRY_DAYS }
