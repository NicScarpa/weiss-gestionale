/**
 * Quante sincronizzazioni restano oggi, per un conto.
 *
 * Puro: nessun database, nessuna rete, nessuna data corrente implicita.
 *
 * ## Il contingente è per endpoint, non complessivo
 *
 * La banca concede **4 chiamate al giorno per conto e per endpoint**
 * (`http_x_ratelimit_account_success_limit=4`). Gli endpoint sotto contingente
 * sono distinti — `/transactions/`, `/balances/`, `/details/` — e ciascuno ha il
 * suo contatore.
 *
 * Una sincronizzazione spende **una chiamata su ciascun endpoint che usa**, mai
 * due sullo stesso. Quindi il numero di sincronizzazioni possibili è 4, e
 * `restantiDichiarate` — che la banca esprime per l'endpoint appena chiamato —
 * è **già in sincronizzazioni**: non va diviso per il numero di endpoint.
 *
 * ## I due conteggi non sono lo stesso conteggio
 *
 * `sincronizzazioniOggi` è ciò che **noi** sappiamo di aver fatto. Non include i
 * ritentativi, e non può: avvengono dentro `conRitentativi` (`client.ts`) e non
 * arrivano al chiamante — `Risposta<T>` restituisce `dati` e `limiti`, non un
 * contatore di tentativi.
 *
 * I ritentativi rientrano dall'altra porta, ed è sufficiente: **colpiscono la
 * banca sullo stesso endpoint**, quindi `restantiDichiarate` li ha già scontati.
 * Il contatore locale serve a decidere *prima* della prima chiamata della
 * giornata, quando nessun header è ancora arrivato; da lì in poi comanda
 * l'header.
 *
 * `RISERVA_RITENTATIVI` esiste proprio perché la stima locale è ottimista per
 * costruzione.
 */

/** Il contingente della banca: 4 al giorno per conto **e per endpoint**. */
export const TETTO_GIORNALIERO = 4

/** Tenuta da parte per i ritentativi, che il contatore locale non vede. */
export const RISERVA_RITENTATIVI = 1

export interface StatoContingente {
  /** Sincronizzazioni che sappiamo di aver fatto oggi su questo conto. */
  sincronizzazioniOggi: number
  /**
   * Residuo dichiarato dalla banca nell'ultimo header letto, per l'endpoint
   * chiamato. Essendo una chiamata per sincronizzazione, è già il numero di
   * sincronizzazioni ancora possibili.
   */
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
  const stimaLocale = TETTO_GIORNALIERO - RISERVA_RITENTATIVI - stato.sincronizzazioniOggi

  const dichiarato =
    stato.restantiDichiarate === null ? Number.POSITIVE_INFINITY : stato.restantiDichiarate

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
