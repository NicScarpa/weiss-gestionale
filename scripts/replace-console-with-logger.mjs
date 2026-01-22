#!/usr/bin/env node

/**
 * Script per sostituire console.log/error/warn con logger
 * Uso: node scripts/replace-console-with-logger.mjs [--dry-run]
 */

import fs from 'fs'
import path from 'path'
import { glob } from 'glob'

const DRY_RUN = process.argv.includes('--dry-run')

const IMPORT_STATEMENT = `import { logger } from '@/lib/logger'`

// File da escludere (test, logger stesso, etc.)
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/logger.ts',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/sw.ts', // Service worker ha limitazioni
]

async function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8')
  let modified = false

  // Verifica se ci sono console.* da sostituire
  const hasConsole = /console\.(log|error|warn|debug)\(/g.test(content)
  if (!hasConsole) {
    return { filePath, modified: false }
  }

  // Verifica se l'import è già presente
  const hasImport = content.includes("from '@/lib/logger'") ||
                    content.includes('from "@/lib/logger"') ||
                    content.includes("from '../../lib/logger'") ||
                    content.includes("from '../../../lib/logger'")

  // Aggiungi import se non presente
  if (!hasImport) {
    // Trova la posizione dopo gli altri import
    const importMatch = content.match(/^(import[\s\S]*?from\s+['"][^'"]+['"]\s*\n)+/m)

    if (importMatch) {
      const insertPosition = importMatch.index + importMatch[0].length
      content = content.slice(0, insertPosition) + IMPORT_STATEMENT + '\n' + content.slice(insertPosition)
    } else {
      // Nessun import esistente, aggiungi all'inizio (dopo eventuali commenti/directive)
      const firstCodeLine = content.match(/^(['"]use (client|server)['"][\s]*\n)?/m)
      const insertPosition = firstCodeLine ? firstCodeLine[0].length : 0
      content = content.slice(0, insertPosition) + IMPORT_STATEMENT + '\n' + content.slice(insertPosition)
    }
    modified = true
  }

  // Sostituisci console.log con logger.info
  if (content.includes('console.log(')) {
    content = content.replace(/console\.log\(/g, 'logger.info(')
    modified = true
  }

  // Sostituisci console.error con logger.error
  if (content.includes('console.error(')) {
    content = content.replace(/console\.error\(/g, 'logger.error(')
    modified = true
  }

  // Sostituisci console.warn con logger.warn
  if (content.includes('console.warn(')) {
    content = content.replace(/console\.warn\(/g, 'logger.warn(')
    modified = true
  }

  // Sostituisci console.debug con logger.debug
  if (content.includes('console.debug(')) {
    content = content.replace(/console\.debug\(/g, 'logger.debug(')
    modified = true
  }

  if (modified && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  return { filePath, modified }
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN - nessuna modifica verrà salvata\n' : '🔄 Sostituendo console.* con logger...\n')

  // Trova tutti i file .ts e .tsx nella cartella src
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: EXCLUDE_PATTERNS,
    absolute: true,
    cwd: process.cwd(),
  })

  let modifiedCount = 0
  const results = []

  for (const file of files) {
    const result = await processFile(file)
    if (result.modified) {
      modifiedCount++
      results.push(result.filePath)
      console.log(`✅ ${path.relative(process.cwd(), result.filePath)}`)
    }
  }

  console.log(`\n📊 Riepilogo:`)
  console.log(`   File analizzati: ${files.length}`)
  console.log(`   File modificati: ${modifiedCount}`)

  if (DRY_RUN && modifiedCount > 0) {
    console.log('\n⚠️  Esegui senza --dry-run per applicare le modifiche')
  }
}

main().catch(console.error)
