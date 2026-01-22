-- =============================================================================
-- Script per abilitare Row Level Security (RLS) su tutte le tabelle
-- Sistema Gestionale Weiss Cafè
-- =============================================================================
-- Questo script:
-- 1. Abilita RLS su tutte le tabelle del schema public
-- 2. Crea policy che permettono accesso completo al service_role (usato da Prisma)
-- 3. Blocca l'accesso diretto tramite API PostgREST (anon/authenticated)
-- =============================================================================

-- Lista di tutte le tabelle da proteggere
DO $$
DECLARE
    table_name TEXT;
    tables TEXT[] := ARRAY[
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
BEGIN
    FOREACH table_name IN ARRAY tables
    LOOP
        -- Verifica se la tabella esiste
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = table_name
        ) THEN
            -- Abilita RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

            -- Forza RLS anche per il table owner (importante per sicurezza)
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);

            -- Rimuovi eventuali policy esistenti per evitare conflitti
            EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', table_name);
            EXECUTE format('DROP POLICY IF EXISTS "deny_anon" ON public.%I', table_name);
            EXECUTE format('DROP POLICY IF EXISTS "deny_authenticated" ON public.%I', table_name);

            -- Crea policy che permette TUTTO al service_role (usato da Prisma)
            EXECUTE format('
                CREATE POLICY "service_role_all" ON public.%I
                FOR ALL
                TO service_role
                USING (true)
                WITH CHECK (true)
            ', table_name);

            RAISE NOTICE 'RLS abilitato su tabella: %', table_name;
        ELSE
            RAISE NOTICE 'Tabella non trovata (saltata): %', table_name;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- Verifica finale: mostra lo stato RLS di tutte le tabelle
-- =============================================================================
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
