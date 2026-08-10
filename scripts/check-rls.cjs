// Verifica (sola lettura) che ogni tabella dello schema public abbia RLS.
// Esce con codice 1 se anche una sola è scoperta: utilizzabile come gate.
//   nvm use 22 && node --env-file=.env scripts/check-rls.cjs
const pg = require('pg');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL non impostata. Usa: node --env-file=.env scripts/check-rls.cjs');
    process.exit(1);
  }
  await client.connect();

  // Dire SU QUALE database si sta guardando: un "tutto protetto" riferito
  // all'ambiente sbagliato è peggio di nessuna verifica.
  const dove = await client.query('SELECT current_database() AS db, current_user AS ruolo');
  console.log(`Database "${dove.rows[0].db}", come "${dove.rows[0].ruolo}"`);

  const res = await client.query(`
    SELECT c.relname AS tablename,
           c.relrowsecurity      AS rowsecurity,
           c.relforcerowsecurity AS forcerowsecurity,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relname
  `);
  const conServiceRole = (
    await client.query("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS c")
  ).rows[0].c;

  const rotta = (r) =>
    !r.rowsecurity || !r.forcerowsecurity || (conServiceRole && r.policy === 0);
  const disabled = res.rows.filter(rotta);

  console.log(
    `Totali: ${res.rows.length} | Protette: ${res.rows.length - disabled.length} | Scoperte: ${disabled.length}`
  );
  if (disabled.length > 0) {
    for (const r of disabled) {
      const perche = [
        !r.rowsecurity ? 'RLS spenta' : null,
        r.rowsecurity && !r.forcerowsecurity ? 'FORCE assente' : null,
        conServiceRole && r.policy === 0 ? 'nessuna policy' : null,
      ].filter(Boolean);
      console.log(`  ${r.tablename} — ${perche.join(', ')}`);
    }
    console.log('\nRimedio: node --env-file=.env scripts/enable-rls.mjs');
  } else {
    console.log('✅ Tutte le tabelle sono protette con RLS!');
  }

  await client.end();
  process.exit(disabled.length === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
