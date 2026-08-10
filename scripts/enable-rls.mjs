#!/usr/bin/env node
// =============================================================================
// Abilita Row Level Security su tutte le tabelle dello schema public.
//
// Questo script NON contiene una lista di tabelle e non contiene la logica:
// esegue prisma/sql/enable_rls_all_tables.sql, che cicla su pg_tables.
// Prima ne esisteva una copia scritta a mano (47 nomi) divergente da quella del
// file SQL (57 nomi) e da entrambe le versioni dello schema. Una fonte sola.
//
// Uso:
//   nvm use 22 && node --env-file=.env scripts/enable-rls.mjs --dry-run
//   nvm use 22 && node --env-file=.env scripts/enable-rls.mjs
//
// Esce con codice 1 se, a lavoro finito, resta anche una sola tabella scoperta:
// così è utilizzabile come gate.
// =============================================================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE_SQL = join(RADICE, 'prisma', 'sql', 'enable_rls_all_tables.sql');

const dryRun = process.argv.includes('--dry-run');

// Stesso criterio di selezione del file SQL: schema public, tabelle vere e
// partizionate, escluse quelle possedute da un'estensione.
const RICOGNIZIONE = `
  SELECT c.relname                                                   AS tabella,
         c.relrowsecurity                                            AS rls,
         c.relforcerowsecurity                                       AS force_rls,
         (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policy
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  ORDER BY c.relname
`;

// La policy mancante è un difetto solo dove service_role esiste: su un
// PostgreSQL che non è Supabase lo script abilita RLS senza policy, ed è giusto.
const difettosa = (r, conServiceRole) =>
  !r.rls || !r.force_rls || (conServiceRole && r.policy === 0);

function riepiloga(righe, titolo, conServiceRole) {
  const rotte = righe.filter((r) => difettosa(r, conServiceRole));
  console.log(`\n${titolo}`);
  console.log(`  tabelle in public: ${righe.length}`);
  console.log(`  protette (RLS + FORCE + policy): ${righe.length - rotte.length}`);
  console.log(`  scoperte: ${rotte.length}`);
  for (const r of rotte) {
    const mancanze = [
      !r.rls ? 'RLS spenta' : null,
      r.rls && !r.force_rls ? 'FORCE assente' : null,
      conServiceRole && r.policy === 0 ? 'nessuna policy' : null,
    ].filter(Boolean);
    console.log(`    ${r.tabella} — ${mancanze.join(', ')}`);
  }
  return rotte;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL non impostata. Usa: node --env-file=.env scripts/enable-rls.mjs');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.on('notice', (msg) => {
    const testo = (msg.message ?? '').trim();
    if (msg.severity === 'WARNING') console.warn(`  ⚠️  ${testo}`);
    else if (testo) console.log(`  ${testo}`);
  });

  await client.connect();

  try {
    const chi = await client.query(`
      SELECT current_user AS ruolo, current_database() AS db,
             COALESCE((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS bypassa,
             EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS service_role
    `);
    const { ruolo, db, bypassa, service_role: conServiceRole } = chi.rows[0];
    console.log(`Database "${db}", connesso come "${ruolo}"${bypassa ? ' (bypassa RLS)' : ' (NON bypassa RLS)'}`);
    if (!conServiceRole) {
      console.log('Ruolo "service_role" assente: RLS senza policy (non è Supabase).');
    }

    const prima = await client.query(RICOGNIZIONE);
    const scopertePrima = riepiloga(prima.rows, 'PRIMA:', conServiceRole);

    if (dryRun) {
      console.log(`\n--dry-run: nessuna modifica. Verrebbero toccate tutte le ${prima.rows.length} tabelle`);
      console.log(`(l'operazione è idempotente; ${scopertePrima.length} cambierebbero davvero stato).`);
      process.exit(scopertePrima.length === 0 ? 0 : 1);
    }

    if (scopertePrima.length === 0) {
      console.log('\nNiente da fare: già tutte protette.');
      process.exit(0);
    }

    // I meta-comandi psql (\set ON_ERROR_STOP …) non sono SQL: il server li
    // rifiuterebbe. Li togliamo qui, l'atomicità la dà la transazione sotto.
    const sql = readFileSync(FILE_SQL, 'utf8')
      .split('\n')
      .filter((riga) => !riga.trimStart().startsWith('\\'))
      .join('\n');

    console.log(`\nEseguo ${FILE_SQL.replace(RADICE + '/', '')}:`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const dopo = await client.query(RICOGNIZIONE);
    const scoperteDopo = riepiloga(dopo.rows, 'DOPO:', conServiceRole);

    if (scoperteDopo.length > 0) {
      console.error(`\n❌ Restano ${scoperteDopo.length} tabelle scoperte.`);
      process.exit(1);
    }
    console.log('\n✅ Tutte le tabelle dello schema public hanno RLS, FORCE e policy.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
