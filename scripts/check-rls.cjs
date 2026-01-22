const pg = require('pg');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  const disabled = res.rows.filter(r => !r.rowsecurity);
  console.log('Totali: ' + res.rows.length + ' | Con RLS: ' + res.rows.filter(r => r.rowsecurity).length + ' | Senza: ' + disabled.length);
  if (disabled.length > 0) {
    disabled.forEach(r => console.log('  Senza RLS: ' + r.tablename));
  } else {
    console.log('✅ Tutte le tabelle sono protette con RLS!');
  }
  await client.end();
}
run();
