// Script per abilitare RLS su tutte le tabelle Supabase
import pg from 'pg';

const { Client } = pg;

const tables = [
  'initial_balances',
  'budgets',
  'roles',
  'venues',
  'daily_closures',
  'cash_stations',
  'cash_counts',
  'hourly_partials',
  'daily_expenses',
  'cash_station_templates',
  'register_balances',
  'suppliers',
  'accounts',
  'daily_attendance',
  'journal_entries',
  'role_permissions',
  'permissions',
  'relationship_constraints',
  'budget_alerts',
  'relationship_constraint_users',
  'shift_definitions',
  'budget_lines',
  'shift_schedules',
  'attendance_anomalies',
  'employee_constraints',
  'shift_assignments',
  'leave_requests',
  'leave_types',
  'leave_balances',
  'attendance_policies',
  'attendance_records',
  'notification_logs',
  'push_subscriptions',
  'notification_preferences',
  'budget_categories',
  'account_budget_mappings',
  'invoice_deadlines',
  'budget_targets',
  'electronic_invoices',
  'bank_transactions',
  'import_batches',
  'recurring_expenses',
  'cash_flow_settings',
  'products',
  'price_history',
  'price_alerts',
  'users'
];

async function enableRLS() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connesso al database\n');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const tableName of tables) {
      try {
        // Verifica se la tabella esiste
        const checkResult = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          )
        `, [tableName]);

        if (!checkResult.rows[0].exists) {
          console.log(`⏭️  Tabella non trovata: ${tableName}`);
          skipCount++;
          continue;
        }

        // Abilita RLS
        await client.query(`ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY`);

        // Forza RLS anche per table owner
        await client.query(`ALTER TABLE public."${tableName}" FORCE ROW LEVEL SECURITY`);

        // Rimuovi policy esistenti
        await client.query(`DROP POLICY IF EXISTS "service_role_all" ON public."${tableName}"`);

        // Crea policy per service_role
        await client.query(`
          CREATE POLICY "service_role_all" ON public."${tableName}"
          FOR ALL
          TO service_role
          USING (true)
          WITH CHECK (true)
        `);

        console.log(`✅ RLS abilitato: ${tableName}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Errore su ${tableName}: ${err.message}`);
        errorCount++;
      }
    }

    console.log('\n========================================');
    console.log(`✅ Successi: ${successCount}`);
    console.log(`⏭️  Saltate: ${skipCount}`);
    console.log(`❌ Errori: ${errorCount}`);
    console.log('========================================');

    // Verifica finale
    const verifyResult = await client.query(`
      SELECT tablename, rowsecurity as rls_enabled
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('\n📊 Stato RLS tabelle:');
    const rlsDisabled = verifyResult.rows.filter(r => !r.rls_enabled);
    if (rlsDisabled.length === 0) {
      console.log('✅ Tutte le tabelle hanno RLS abilitato!');
    } else {
      console.log(`⚠️  Tabelle senza RLS: ${rlsDisabled.map(r => r.tablename).join(', ')}`);
    }

  } catch (err) {
    console.error('❌ Errore di connessione:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

enableRLS();
