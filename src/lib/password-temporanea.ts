import crypto from 'crypto'

/**
 * Genera la password temporanea consegnata a un utente alla creazione o dopo un
 * reset.
 *
 * Due vincoli, entrambi pratici:
 * - rispetta `passwordSchema` (src/lib/validations/password.ts), così resta
 *   valida anche se un domani venisse rivalidata al login;
 * - va dettata a voce o copiata a mano, quindi esclude i caratteri che si
 *   confondono leggendo (O/0, l/1/I) e resta corta abbastanza da trascriverla.
 *
 * 14 caratteri su un alfabeto di 68 valgono ~85 bit di entropia: abbondante per
 * una credenziale che dura fino al primo accesso.
 */
export function generaPasswordTemporanea(): string {
  const maiuscole = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minuscole = 'abcdefghijkmnopqrstuvwxyz'
  const numeri = '23456789'
  const speciali = '!@#$%&*?'
  const tutti = maiuscole + minuscole + numeri + speciali

  const scegli = (alfabeto: string) => alfabeto[crypto.randomInt(alfabeto.length)]

  // Un carattere garantito per classe, poi riempimento fino a 14
  const caratteri = [scegli(maiuscole), scegli(minuscole), scegli(numeri), scegli(speciali)]
  while (caratteri.length < 14) caratteri.push(scegli(tutti))

  // Mescolamento Fisher-Yates: senza, le prime quattro posizioni sarebbero
  // sempre della stessa classe e l'entropia reale scenderebbe.
  for (let i = caratteri.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[caratteri[i], caratteri[j]] = [caratteri[j], caratteri[i]]
  }

  return caratteri.join('')
}
