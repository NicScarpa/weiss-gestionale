/**
 * Le due eccezioni del client.
 *
 * `LimiteRaggiunto` è separata perché chi chiama deve poterla distinguere
 * senza leggere un codice numerico: un 429 dalla banca non è un errore
 * transitorio da ritentare, è un «ripassa domani», e va registrato come tale
 * in `bank_sync_runs` invece di finire nel calderone dei fallimenti.
 */
export class ErroreGoCardless extends Error {
  constructor(
    message: string,
    readonly stato: number,
    readonly corpo: unknown
  ) {
    super(message)
    this.name = 'ErroreGoCardless'
  }
}

export class LimiteRaggiunto extends ErroreGoCardless {
  constructor(
    message: string,
    corpo: unknown,
    readonly secondiAllaRipresa: number | null
  ) {
    super(message, 429, corpo)
    this.name = 'LimiteRaggiunto'
  }
}
