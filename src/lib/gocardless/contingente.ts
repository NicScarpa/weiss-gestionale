/**
 * Quante sincronizzazioni restano oggi, per un conto.
 *
 * Puro: nessun database, nessuna rete, nessuna data corrente implicita.
 *
 * ## I due conteggi non sono lo stesso conteggio
 *
 * `chiamateOggi` è ciò che **noi** sappiamo di aver chiesto: due per
 * sincronizzazione. Non include i ritentativi, e non può: avvengono dentro
 * `conRitentativi` (`client.ts`) e non arrivano al chiamante — `Risposta<T>`
 * restituisce `dati` e `limiti`, non un contatore di tentativi.
 *
 * I ritentativi rientrano dall'altra porta, ed è sufficiente: **colpiscono la
 * banca**, quindi `restantiDichiarate` li ha già scontati. Il contatore locale
 * serve a decidere *prima* della prima chiamata della giornata, quando nessun
 * header è ancora arrivato; da lì in poi comanda l'header.
 *
 * `RISERVA_RITENTATIVI` esiste proprio perché la stima locale è ottimista per
 * costruzione.
 */

/** Il contingente della banca: 4 chiamate al giorno per conto **e per endpoint**. */
export const TETTO_GIORNALIERO = 4

/** `transactions` + `balances`: una sincronizzazione ne spende due. */
export const CHIAMATE_PER_SINCRONIZZAZIONE = 2

/** Tenuta da parte per i ritentativi, che il contatore locale non vede. */
export const RISERVA_RITENTATIVI = 1

export interface StatoContingente {
  /** Chiamate che sappiamo di aver fatto oggi su questo conto. */
  chiamateOggi: number
  /** Chiamate residue dichiarate dalla banca nell'ultimo header letto. */
  restantiDichiarate: number | null
  /** Istante in cui il contingente si riapre, se la banca l'ha detto. */
  riapreAlle: Date | null
}

export interface EsitoContingente {
  si: boolean
  motivo?: string
  riapreAlle: Date | null
}

/**
 * `ripresaFraSecondi` di `Limiti` è una **durata**, non un istante: questa è la
 * conversione, e sta qui perché è l'unico punto che conosce il significato di
 * quel numero. Senza durata non si inventa un istante — un «riapre alle» falso
 * è peggio di nessuna informazione, perché qualcuno ci tornerebbe sopra.
 */
export function riapertura(ripresaFraSecondi: number | null, adesso: Date): Date | null {
  if (ripresaFraSecondi === null) return null
  return new Date(adesso.getTime() + ripresaFraSecondi * 1000)
}

export function sincronizzazioniRimaste(stato: StatoContingente): number {
  const stimaLocale =
    TETTO_GIORNALIERO -
    RISERVA_RITENTATIVI -
    Math.floor(stato.chiamateOggi / CHIAMATE_PER_SINCRONIZZAZIONE)

  // `restantiDichiarate` è in **chiamate**: due per sincronizzazione, e si
  // arrotonda per difetto — con una chiamata sola non si fa nulla di utile.
  const dichiarato =
    stato.restantiDichiarate === null
      ? Number.POSITIVE_INFINITY
      : Math.floor(stato.restantiDichiarate / CHIAMATE_PER_SINCRONIZZAZIONE)

  return Math.max(0, Math.min(stimaLocale, dichiarato))
}

export function puoSincronizzare(stato: StatoContingente): EsitoContingente {
  if (sincronizzazioniRimaste(stato) > 0) {
    return { si: true, riapreAlle: stato.riapreAlle }
  }

  return {
    si: false,
    motivo: 'Contingente giornaliero della banca esaurito per questo conto',
    riapreAlle: stato.riapreAlle,
  }
}
