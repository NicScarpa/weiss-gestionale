import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import { logger } from './logger'

/**
 * Astrazione per l'archiviazione dei file caricati (cedolini, documenti
 * dipendente, allegati dello scadenzario).
 *
 * Due backend:
 *  - `local`  → filesystem. Su Railway il filesystem del container è EFFIMERO:
 *               senza un volume persistente montato su UPLOAD_ROOT i file
 *               spariscono a ogni deploy. Vedi docs/storage.md.
 *  - `supabase` → Supabase Storage (bucket privato + signed URL). Si attiva
 *               da solo quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono
 *               presenti nell'ambiente.
 *
 * Le chiavi (`key`) sono percorsi relativi con separatore `/`, es.
 * "documents/cedolini/2026-08/mario-rossi.pdf". Non usare percorsi assoluti.
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads'

/** Radice del filesystem locale: su Railway va fatta puntare al volume montato. */
export const UPLOAD_ROOT = process.env.UPLOAD_ROOT || join(process.cwd(), 'uploads')

export type StorageBackend = 'local' | 'supabase'

export function getStorageBackend(): StorageBackend {
  return SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local'
}

/** Normalizza una chiave: niente slash iniziali, niente traversal. */
function normalizeKey(key: string): string {
  const cleaned = key.replace(/\\/g, '/').replace(/^\/+/, '')
  if (cleaned.split('/').some((seg) => seg === '..')) {
    throw new Error('Percorso file non valido')
  }
  return cleaned
}

function supabaseObjectUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${key}`
}

/** Salva un file e restituisce la chiave con cui rileggerlo. */
export async function putFile(
  key: string,
  data: Buffer,
  contentType = 'application/octet-stream'
): Promise<string> {
  const safeKey = normalizeKey(key)

  if (getStorageBackend() === 'supabase') {
    const res = await fetch(supabaseObjectUrl(safeKey), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      logger.error('Upload su Supabase Storage fallito', { key: safeKey, status: res.status, detail })
      throw new Error('Impossibile salvare il file')
    }
    return safeKey
  }

  const fullPath = join(UPLOAD_ROOT, safeKey)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, data)
  return safeKey
}

/** Legge un file salvato in precedenza. Restituisce null se non esiste. */
export async function getFile(key: string): Promise<Buffer | null> {
  const safeKey = normalizeKey(key)

  if (getStorageBackend() === 'supabase') {
    const res = await fetch(supabaseObjectUrl(safeKey), {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    })
    if (res.status === 404) return null
    if (!res.ok) {
      logger.error('Lettura da Supabase Storage fallita', { key: safeKey, status: res.status })
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  }

  try {
    return await readFile(join(UPLOAD_ROOT, safeKey))
  } catch {
    return null
  }
}

/** Elimina un file. Non solleva se il file non esiste. */
export async function deleteFile(key: string): Promise<void> {
  const safeKey = normalizeKey(key)

  if (getStorageBackend() === 'supabase') {
    const res = await fetch(supabaseObjectUrl(safeKey), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    })
    if (!res.ok && res.status !== 404) {
      logger.error('Eliminazione da Supabase Storage fallita', { key: safeKey, status: res.status })
    }
    return
  }

  try {
    await unlink(join(UPLOAD_ROOT, safeKey))
  } catch {
    // già assente: niente da fare
  }
}
