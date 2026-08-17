import { describe, it, expect } from 'vitest'
import { pianificaMigrazioneUsername } from '../username'

/**
 * La migrazione riscrive la chiave d'accesso di persone vere, quindi il piano si
 * decide **prima** di scrivere e si può leggere: chi cambia, in cosa, e chi si
 * salta con quale motivo. Qui si prova il piano, non la scrittura — così i casi
 * scomodi (omonimi migrati insieme, account di sistema, seconda esecuzione) si
 * verificano senza un database.
 */

const UTENTE = (id: string, username: string, firstName: string, lastName: string) => ({
  id,
  username,
  firstName,
  lastName,
})

describe('pianificaMigrazioneUsername', () => {
  it('rinomina un utente nella forma nuova', () => {
    const piano = pianificaMigrazioneUsername([UTENTE('u1', 'AlessandraPiazzon', 'Alessandra', 'Piazzon')])
    expect(piano).toEqual([
      { id: 'u1', azione: 'rinomina', da: 'AlessandraPiazzon', a: 'piazzon.alessandra' },
    ])
  })

  it('salta gli account di sistema, che hanno un indirizzo come username', () => {
    // `admin@weisscafe.it` e `manager@weisscafe.it` restano come sono per scelta:
    // sono account di sistema, non persone.
    const piano = pianificaMigrazioneUsername([
      UTENTE('u1', 'admin@weisscafe.it', 'Nicolas', 'Carpa'),
      UTENTE('u2', 'manager@weisscafe.it', 'Manager', 'Weiss'),
    ])
    expect(piano).toEqual([
      { id: 'u1', azione: 'salta', username: 'admin@weisscafe.it', motivo: 'account di sistema' },
      { id: 'u2', azione: 'salta', username: 'manager@weisscafe.it', motivo: 'account di sistema' },
    ])
  })

  it('due omonimi migrati insieme non si prendono lo stesso nome', () => {
    const piano = pianificaMigrazioneUsername([
      UTENTE('u1', 'MarioRossi', 'Mario', 'Rossi'),
      UTENTE('u2', 'MarioRossi2', 'Mario', 'Rossi'),
    ])
    expect(piano).toEqual([
      { id: 'u1', azione: 'rinomina', da: 'MarioRossi', a: 'rossi.mario' },
      { id: 'u2', azione: 'rinomina', da: 'MarioRossi2', a: 'rossi.mario2' },
    ])
  })

  it('alla seconda esecuzione non fa nulla', () => {
    // Idempotenza: chi è già nella forma giusta si salta, così lo script si può
    // rilanciare dopo un'interruzione senza produrre `rossi.mario2` dal nulla.
    const piano = pianificaMigrazioneUsername([UTENTE('u1', 'rossi.mario', 'Mario', 'Rossi')])
    expect(piano).toEqual([
      { id: 'u1', azione: 'salta', username: 'rossi.mario', motivo: 'già nella forma nuova' },
    ])
  })

  it("non ruba lo username già nella forma nuova di un altro", () => {
    // u1 è già `rossi.mario`; u2 è un omonimo ancora da migrare e deve finire sul 2.
    const piano = pianificaMigrazioneUsername([
      UTENTE('u1', 'rossi.mario', 'Mario', 'Rossi'),
      UTENTE('u2', 'MarioRossi2', 'Mario', 'Rossi'),
    ])
    expect(piano[1]).toEqual({ id: 'u2', azione: 'rinomina', da: 'MarioRossi2', a: 'rossi.mario2' })
  })

  it('non assegna un nome che collide con lo username attuale di un altro utente', () => {
    // Caso raro ma possibile: qualcuno si chiama già `rossi.mario` per caso, e
    // non è un omonimo. Rinominare u2 in `rossi.mario` violerebbe l'unicità.
    const piano = pianificaMigrazioneUsername([
      UTENTE('u1', 'rossi.mario', 'Maria', 'Rossini'),
      UTENTE('u2', 'MarioRossi', 'Mario', 'Rossi'),
    ])
    expect(piano[0]).toEqual({
      id: 'u1',
      azione: 'rinomina',
      da: 'rossi.mario',
      a: 'rossini.maria',
    })
    // u1 libera `rossi.mario` cambiando nome, ma il piano non può contare
    // sull'ordine delle scritture: u2 prende il suffisso.
    expect(piano[1]).toEqual({ id: 'u2', azione: 'rinomina', da: 'MarioRossi', a: 'rossi.mario2' })
  })

  it("l'ordine del piano non dipende dall'ordine in cui arrivano gli utenti", () => {
    const avanti = pianificaMigrazioneUsername([
      UTENTE('u1', 'MarioRossi', 'Mario', 'Rossi'),
      UTENTE('u2', 'AnnaBianchi', 'Anna', 'Bianchi'),
    ])
    const indietro = pianificaMigrazioneUsername([
      UTENTE('u2', 'AnnaBianchi', 'Anna', 'Bianchi'),
      UTENTE('u1', 'MarioRossi', 'Mario', 'Rossi'),
    ])
    const perId = (piano: typeof avanti) => [...piano].sort((a, b) => a.id.localeCompare(b.id))
    expect(perId(avanti)).toEqual(perId(indietro))
  })
})
