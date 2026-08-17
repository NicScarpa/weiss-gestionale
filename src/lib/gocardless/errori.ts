/**
 * Le eccezioni del client, più `ConfigurazioneMancante` che non ne fa parte
 * (nessuna chiamata è partita) ma vive qui accanto perché chi risponde alle
 * rotte deve distinguere anche questo caso dagli altri due.
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

/**
 * Le chiavi non sono configurate. È un problema di installazione, non un
 * guasto: chi lo riceve deve sapere che manca una variabile d'ambiente, non
 * pensare che la banca sia irraggiungibile.
 */
export class ConfigurazioneMancante extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurazioneMancante'
  }
}
