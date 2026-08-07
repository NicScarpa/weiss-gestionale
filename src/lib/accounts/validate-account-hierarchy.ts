import { PIANO_CONTI_WEISS_V4 } from './piano-conti-weiss-v4'

/**
 * Coerenza fra il `code` dichiarato di una voce e la gerarchia mastro/gruppo
 * scelta per lei (Task 18, fix round 1: prima di questo controllo l'API
 * accettava una voce `99.99` dichiarata del mastro "20" senza obiezioni).
 *
 * Conta più di un vincolo estetico: l'albero (`build-account-tree.ts`) e il
 * report per centro raggruppano per le **colonne denormalizzate**
 * (`mastroCode`/`gruppoCode`), non per il prefisso del `code`. Una voce
 * incoerente non fallisce da nessuna parte: compare semplicemente nel ramo
 * sbagliato — una classificazione contabile sbagliata, silenziosa.
 *
 * Condivisa fra client (`AccountManagement.tsx`, per mostrare l'errore prima
 * dell'invio) e server (`api/accounts/route.ts`, la difesa vera: l'endpoint
 * è raggiungibile anche fuori dal form). Va valutata sullo **stato
 * risultante** di un conto — per un PUT parziale, `code`/`mastroCode`/
 * `gruppoCode` sono già il merge fra il conto esistente e il payload prima
 * di arrivare qui, non il payload da solo.
 */
export function erroreCoerenzaGerarchia(params: {
  code: string
  mastroCode: string | null
  gruppoCode: string | null
}): string | null {
  const { code, mastroCode, gruppoCode } = params

  if (gruppoCode && !mastroCode) {
    return 'Il gruppo richiede un mastro'
  }

  if (gruppoCode && mastroCode && !gruppoCode.startsWith(`${mastroCode}.`)) {
    return 'Il gruppo selezionato non appartiene al mastro selezionato'
  }

  // Confronto sul segmento, non su un prefisso di stringa qualunque: senza
  // il punto esplicito, "201.01" supererebbe il controllo per il mastro
  // "20" (è un prefisso di stringa valido, ma non un prefisso di segmento
  // del piano — il primo segmento vero è "201").
  const prefisso = gruppoCode ?? mastroCode
  if (prefisso && !code.startsWith(`${prefisso}.`)) {
    return gruppoCode
      ? 'Il codice non è coerente con il gruppo selezionato'
      : 'Il codice non è coerente con il mastro selezionato'
  }

  return null
}

/**
 * Guardia aggiuntiva, solo server: se il `code` coincide con una delle 155
 * voci del piano ufficiale WEISS v4, il mastro/gruppo dichiarati devono
 * coincidere con quelli del piano — un prefisso plausibile non basta se il
 * codice è già censito con una gerarchia diversa. Un `code` fuori dal piano
 * (voce nuova, non ancora censita) non è vincolato da questo controllo:
 * l'unico vincolo per lui resta `erroreCoerenzaGerarchia`.
 */
export function erroreIncoerenzaConPianoUfficiale(params: {
  code: string
  mastroCode: string | null
  gruppoCode: string | null
}): string | null {
  const voceUfficiale = PIANO_CONTI_WEISS_V4.find((v) => v.code === params.code)
  if (!voceUfficiale) {
    return null
  }

  const gruppoUfficiale = voceUfficiale.gruppoCode ?? null
  if (voceUfficiale.mastroCode !== params.mastroCode || gruppoUfficiale !== params.gruppoCode) {
    const dettaglio = gruppoUfficiale
      ? `mastro ${voceUfficiale.mastroCode}, gruppo ${gruppoUfficiale}`
      : `mastro ${voceUfficiale.mastroCode}`
    return `Il codice "${params.code}" appartiene al piano ufficiale con ${dettaglio}, diverso da quanto dichiarato`
  }

  return null
}
