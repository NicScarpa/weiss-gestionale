import { sendEmail } from './email'

const APP_NAME = 'Weiss Cafe'

/**
 * Invia email di invito per registrazione staff
 */
export async function sendStaffInvitationEmail(
  email: string,
  token: string,
  firstName: string,
  invitedByName: string
): Promise<boolean> {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000'
  const inviteUrl = `${appUrl}/invito?token=${token}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sei stato invitato</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">${APP_NAME}</h1>
    <p style="color: #ccc; margin: 10px 0 0 0; font-size: 14px;">Sistema Gestionale</p>
  </div>

  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Sei stato invitato!</h2>

    <p>Ciao <strong>${firstName}</strong>,</p>

    <p><strong>${invitedByName}</strong> ti ha invitato a unirti al team di ${APP_NAME}. Per completare la registrazione e accedere al sistema, clicca sul pulsante qui sotto:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}"
         style="background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        Completa la registrazione
      </a>
    </div>

    <p style="font-size: 13px; color: #666;">
      Oppure copia e incolla questo link nel tuo browser:<br>
      <a href="${inviteUrl}" style="color: #0066cc; word-break: break-all;">${inviteUrl}</a>
    </p>

    <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin-top: 20px;">
      <p style="margin: 0; font-size: 13px; color: #856404;">
        <strong>Attenzione:</strong> Questo link scade tra <strong>7 giorni</strong>.
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; margin-bottom: 0;">
      Questa email e stata inviata automaticamente da ${APP_NAME}.<br>
      Se non ti aspettavi questo invito, puoi ignorare questa email in sicurezza.
    </p>
  </div>
</body>
</html>
`

  const text = `
Ciao ${firstName},

${invitedByName} ti ha invitato a unirti al team di ${APP_NAME}.

Per completare la registrazione, visita questo link:
${inviteUrl}

Attenzione: Questo link scade tra 7 giorni.

Se non ti aspettavi questo invito, puoi ignorare questa email.

--
${APP_NAME}
`

  return sendEmail({
    to: email,
    subject: `${APP_NAME} - Sei stato invitato`,
    html,
    text,
  })
}
