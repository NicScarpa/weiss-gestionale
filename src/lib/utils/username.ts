/**
 * Generazione e gestione degli username.
 *
 * **Regola unica: `cognome.nome`**, minuscolo, senza accenti né spazi
 * (`rossi.mario`, `deandre.nicolo`). In caso di omonimia si aggiunge un numero
 * progressivo (`rossi.mario2`, `rossi.mario3`) e chi crea l'utente può
 * correggere la proposta prima di salvare: nessuna regola automatica indovina
 * tutti i casi veri, e un campo aperto li copre.
 *
 * Fino al 17 agosto 2026 le regole erano due e discordanti — `NomeCognome` per
 * lo staff, l'**email** come username per admin e manager — e nemmeno applicate
 * in modo uniforme: in produzione un manager risultava `AndreaSegatto` perché i
 * percorsi di creazione sono due e non concordavano. Da qui i due account
 * storici `admin@weisscafe.it` e `manager@weisscafe.it`, che restano come sono
 * per scelta: sono account di sistema, non persone.
 *
 * Lo username non è l'unica chiave d'accesso: `src/lib/auth.ts` accetta username
 * **oppure** email. È la ragione per cui rinominare un utente non gli chiude la
 * porta in faccia.
 */

import type { Prisma } from '@prisma/client'

/**
 * Il solo pezzo di client che questa funzione usa.
 *
 * Descritto per struttura e non come `PrismaClient`: i chiamanti passano il
 * client esteso di `@/lib/prisma` (cifratura + soft delete), i cui delegate non
 * sono lo stesso tipo di quelli del client nudo. Prima qui c'era un `| any`,
 * che rendeva `any` l'intero risultato di `findMany` e con esso ogni riga sotto.
 */
type ClientUtenti = {
  user: {
    findMany(args: {
      where: Prisma.UserWhereInput
      select: { username: true }
    }): Promise<Array<{ username: string }>>
  }
}

/**
 * Normalizza una stringa rimuovendo accenti, spazi e caratteri speciali
 */
export function normalizeString(str: string): string {
  return str
    // Normalizza Unicode (NFD separa i caratteri base dai diacritici)
    .normalize('NFD')
    // Rimuove i diacritici (accenti)
    .replace(/[\u0300-\u036f]/g, '')
    // Rimuove apostrofi e caratteri speciali
    .replace(/[''`]/g, '')
    // Rimuove spazi
    .replace(/\s+/g, '')
    // Solo lettere e numeri
    .replace(/[^a-zA-Z0-9]/g, '')
}

/**
 * Genera lo username base da nome e cognome: `cognome.nome`, tutto minuscolo.
 *
 * Es: "Mario" + "Rossi" → "rossi.mario"
 * Es: "Nicolò" + "De Andrè" → "deandre.nicolo"
 *
 * **Il cognome viene prima** perché è così che si cercano le persone in un
 * elenco, e **il punto è uno solo** perché lo username va dettato al telefono:
 * «cognome punto nome» non richiede spiegazioni. Il minuscolo evita la domanda
 * «con la maiuscola?» a ogni consegna di credenziali.
 */
export function generateUsername(firstName: string, lastName: string): string {
  const nome = normalizeString(firstName).toLowerCase()
  const cognome = normalizeString(lastName).toLowerCase()

  return `${cognome}.${nome}`
}

/**
 * Genera uno username unico, aggiungendo suffisso numerico se necessario
 *
 * @param prisma - Istanza Prisma per query database
 * @param firstName - Nome utente
 * @param lastName - Cognome utente
 * @param excludeUserId - ID utente da escludere dalla verifica (per aggiornamenti)
 */
export async function generateUniqueUsername(
  prisma: ClientUtenti,
  firstName: string,
  lastName: string,
  excludeUserId?: string
): Promise<string> {
  const baseUsername = generateUsername(firstName, lastName)

  // Cerca username esistenti che iniziano con lo stesso base
  const existingUsers = await prisma.user.findMany({
    where: {
      username: {
        startsWith: baseUsername,
      },
      ...(excludeUserId && { NOT: { id: excludeUserId } }),
    },
    select: { username: true },
  })

  if (existingUsers.length === 0) {
    return baseUsername
  }

  // Estrai i suffissi numerici esistenti
  const existingUsernames = new Set(existingUsers.map(u => u.username))

  // Se il base username non esiste, usalo
  if (!existingUsernames.has(baseUsername)) {
    return baseUsername
  }

  // Trova il primo suffisso disponibile
  let suffix = 2
  while (existingUsernames.has(`${baseUsername}${suffix}`)) {
    suffix++
  }

  return `${baseUsername}${suffix}`
}

/** Lunghezze ammesse per uno username scelto a mano. */
const USERNAME_MIN = 3
const USERNAME_MAX = 40

/**
 * Ripulisce quello che arriva dal campo: spazi ai bordi e minuscolo, niente
 * altro.
 *
 * Normalizzare più di così — togliere gli spazi interni, sostituire i caratteri
 * strani — consegnerebbe all'utente uno username **diverso** da quello che ha
 * scritto senza dirglielo, e la chiave d'accesso è l'ultimo posto dove fare
 * correzioni silenziose. Quello che resta sbagliato viene rifiutato da
 * `usernameValido`, e chi lo ha scritto lo corregge.
 */
export function normalizzaUsernameScelto(input: string): string {
  return input.trim().toLowerCase()
}

/**
 * Uno username scritto a mano è accettabile se si può dettare a voce e non
 * assomiglia a un percorso o a un indirizzo: solo lettere e cifre minuscole,
 * separate al più da punti singoli, mai in apertura o chiusura.
 *
 * I due account di sistema (`admin@weisscafe.it`) non passerebbero questo
 * controllo, ed è voluto: esistono da prima e non si creano più così.
 */
export function usernameValido(username: string): boolean {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return false

  return /^[a-z0-9]+(\.[a-z0-9]+)*$/.test(username)
}

/** Una riga del piano di migrazione: o si rinomina, o si salta con un motivo. */
export type RigaMigrazioneUsername =
  | { id: string; azione: 'rinomina'; da: string; a: string }
  | { id: string; azione: 'salta'; username: string; motivo: string }

interface UtenteDaMigrare {
  id: string
  username: string
  firstName: string
  lastName: string
}

/**
 * Decide, senza scrivere niente, cosa succederebbe a ciascun utente passando a
 * `cognome.nome`.
 *
 * Sta separata dallo script perché riscrive la chiave d'accesso di persone vere:
 * il piano va letto prima di essere eseguito, e i casi scomodi — due omonimi
 * migrati nello stesso giro, un nome nuovo che collide con lo username attuale
 * di un altro, una seconda esecuzione dopo un'interruzione — si provano meglio
 * qui che su un database.
 *
 * Due scelte da non smontare:
 *
 * - **Gli account il cui username è un indirizzo si saltano.** È il modo più
 *   semplice di riconoscere i due account di sistema (`admin@weisscafe.it`,
 *   `manager@weisscafe.it`) senza inseguire i ruoli, che in produzione non sono
 *   coerenti con la vecchia regola.
 * - **Il piano non conta sull'ordine delle scritture.** Se un utente libera un
 *   nome cambiando il proprio, il nome liberato *non* viene riusato: fra il
 *   piano e l'ultima scrittura c'è una finestra in cui l'unicità va rispettata
 *   comunque, e un piano che dipende dall'ordine fallirebbe a metà lasciando il
 *   lavoro incompleto.
 */
export function pianificaMigrazioneUsername(
  utenti: UtenteDaMigrare[]
): RigaMigrazioneUsername[] {
  // Tutti gli username in circolazione oggi: nessun nome nuovo può finire qui
  // dentro, nemmeno quelli che verranno liberati durante la migrazione.
  const occupati = new Set(utenti.map((u) => u.username))

  return utenti.map((utente) => {
    if (utente.username.includes('@')) {
      return {
        id: utente.id,
        azione: 'salta' as const,
        username: utente.username,
        motivo: 'account di sistema',
      }
    }

    const base = generateUsername(utente.firstName, utente.lastName)

    if (utente.username === base) {
      return {
        id: utente.id,
        azione: 'salta' as const,
        username: utente.username,
        motivo: 'già nella forma nuova',
      }
    }

    let candidato = base
    let suffisso = 2
    while (occupati.has(candidato)) {
      candidato = `${base}${suffisso}`
      suffisso++
    }
    occupati.add(candidato)

    return { id: utente.id, azione: 'rinomina' as const, da: utente.username, a: candidato }
  })
}

