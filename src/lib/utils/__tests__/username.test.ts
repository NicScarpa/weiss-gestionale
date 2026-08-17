import { describe, it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { generateUsername, generateUniqueUsername, normalizeString } from '../username'

/**
 * Lo username è la chiave con cui una persona entra, e va dettato al telefono:
 * `cognome.nome`, tutto minuscolo, senza accenti né spazi. Prima di questo file
 * il generatore non aveva **nessun** test, e produceva `NomeCognome`.
 *
 * `generateUniqueUsername` riceve il client Prisma come parametro, quindi qui si
 * passa un finto con la sola `findMany` che serve: sostituire un database per
 * provare la composizione di una stringa aggiungerebbe minuti a ogni esecuzione
 * senza provare niente in più.
 */
function prismaFinto(usernameEsistenti: string[]) {
  // La firma segue il contratto vero (`where: Prisma.UserWhereInput`), non una
  // versione comoda: un finto più permissivo del chiamante non accorgerebbe di
  // una query cambiata sotto.
  const findMany = vi.fn(
    async (args: { where: Prisma.UserWhereInput; select: { username: true } }) => {
      const filtro = args.where.username
      const prefisso =
        typeof filtro === 'object' && filtro !== null && 'startsWith' in filtro
          ? String(filtro.startsWith)
          : ''
      return usernameEsistenti
        .filter((u) => u.startsWith(prefisso))
        .map((username) => ({ username }))
    }
  )
  return { user: { findMany } }
}

describe('normalizeString', () => {
  it('toglie gli accenti senza perdere la lettera', () => {
    expect(normalizeString('Nicolò')).toBe('Nicolo')
    expect(normalizeString('Andrè')).toBe('Andre')
  })

  it('toglie apostrofi e spazi', () => {
    expect(normalizeString("D'Amico")).toBe('DAmico')
    expect(normalizeString('De Andrè')).toBe('DeAndre')
  })
})

describe('generateUsername', () => {
  it('mette il cognome davanti al nome, separati da un punto', () => {
    expect(generateUsername('Mario', 'Rossi')).toBe('rossi.mario')
  })

  it('è tutto minuscolo, qualunque cosa arrivi dal form', () => {
    expect(generateUsername('MARIO', 'ROSSI')).toBe('rossi.mario')
    expect(generateUsername('mArIo', 'rOsSi')).toBe('rossi.mario')
  })

  it('regge i nomi veri dei dipendenti', () => {
    // Sono i nomi in produzione al 17 agosto 2026: nessuno di questi collide.
    expect(generateUsername('Alessandra', 'Piazzon')).toBe('piazzon.alessandra')
    expect(generateUsername('Matteo', 'Momesso')).toBe('momesso.matteo')
    expect(generateUsername('Vanessa', 'Basso')).toBe('basso.vanessa')
  })

  it('toglie accenti, apostrofi e spazi dai cognomi composti', () => {
    expect(generateUsername('Nicolò', 'De Andrè')).toBe('deandre.nicolo')
    expect(generateUsername('Maria', "D'Amico")).toBe('damico.maria')
    expect(generateUsername('Anna', 'Della Valle')).toBe('dellavalle.anna')
  })

  it('il punto separa i due campi e non ne compaiono altri', () => {
    // Un punto solo: è quello che permette di leggere «cognome punto nome» al
    // telefono senza spiegare altro.
    const generato = generateUsername('Maria Luisa', 'De Santis')
    expect(generato).toBe('desantis.marialuisa')
    expect(generato.split('.')).toHaveLength(2)
  })
})

describe('generateUniqueUsername', () => {
  it('quando è libero usa la forma piena', async () => {
    const prisma = prismaFinto([])
    await expect(generateUniqueUsername(prisma, 'Mario', 'Rossi')).resolves.toBe('rossi.mario')
  })

  it('sul secondo omonimo aggiunge il 2, sul terzo il 3', async () => {
    await expect(
      generateUniqueUsername(prismaFinto(['rossi.mario']), 'Mario', 'Rossi')
    ).resolves.toBe('rossi.mario2')

    await expect(
      generateUniqueUsername(prismaFinto(['rossi.mario', 'rossi.mario2']), 'Mario', 'Rossi')
    ).resolves.toBe('rossi.mario3')
  })

  it('riempie il buco lasciato da un utente cancellato', async () => {
    // Esistono 1 e 3: il posto libero è il 2, e va riusato invece di arrivare al 4.
    await expect(
      generateUniqueUsername(prismaFinto(['rossi.mario', 'rossi.mario3']), 'Mario', 'Rossi')
    ).resolves.toBe('rossi.mario2')
  })

  it('un nome più lungo che comincia uguale non ruba il posto', async () => {
    // `rossi.mariotto` inizia per `rossi.mario`: la ricerca per prefisso lo trova,
    // ma non è un omonimo e non deve spingere Mario sul suffisso.
    await expect(
      generateUniqueUsername(prismaFinto(['rossi.mariotto']), 'Mario', 'Rossi')
    ).resolves.toBe('rossi.mario')
  })

  it("escludendo l'utente che si sta modificando, il suo stesso username resta libero", async () => {
    const prisma = prismaFinto(['rossi.mario'])
    // La `findMany` riceve il NOT sull'id: qui il finto non filtra per id, quindi
    // si verifica che l'esclusione arrivi alla query — è lì che il difetto
    // si nasconderebbe.
    await generateUniqueUsername(prisma, 'Mario', 'Rossi', 'utente-1')
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ NOT: { id: 'utente-1' } }) })
    )
  })
})
