import os from 'node:os'
import path from 'node:path'

/**
 * Dove finisce la sessione dell'admin usata da tutte le spec.
 *
 * Sta nella cartella temporanea del sistema e non nel repository per due
 * motivi: è un file con dentro un cookie di sessione, e non c'è nessuna riga di
 * `.gitignore` che lo copra (quel file appartiene a un altro proprietario).
 * Viene riscritto a ogni esecuzione dal global setup, quindi non invecchia.
 */
export const PERCORSO_SESSIONE = path.join(os.tmpdir(), 'weiss-e2e-sessione-admin.json')
