-- =============================================================================
-- Piano dei conti v4 + centri di costo
-- Task 2: tabella cost_centers, colonne di supporto sul piano dei conti e sui
-- movimenti, RLS sulla nuova tabella.
--
-- Idempotente: eseguibile più volte senza errori (IF NOT EXISTS ovunque
-- possibile, DO $$ ... EXCEPTION WHEN duplicate_object per gli enum e le FK,
-- che Postgres non sa esprimere con IF NOT EXISTS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum della regola di applicazione del centro di costo sul conto.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "CostCenterRule" AS ENUM ('OBBLIGATORIO', 'DEFAULT_STR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Tabella cost_centers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cost_centers" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_code_key" ON "cost_centers"("code");
-- Al più un centro di costo di default: indice unico parziale, non esprimibile in schema.prisma.
CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_one_default" ON "cost_centers" ("is_default") WHERE "is_default";

-- Row Level Security sulla nuova tabella (stesso pattern di enable_rls_all_tables.sql).
ALTER TABLE "cost_centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_centers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON "cost_centers";
DROP POLICY IF EXISTS "deny_anon" ON "cost_centers";
DROP POLICY IF EXISTS "deny_authenticated" ON "cost_centers";
CREATE POLICY "service_role_all" ON "cost_centers"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- accounts: colonne del piano v4 (mastro/gruppo denormalizzati, regola del
-- centro di costo, chiave dei conti di sistema).
-- -----------------------------------------------------------------------------
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "mastro_code" TEXT,
  ADD COLUMN IF NOT EXISTS "mastro_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "gruppo_code" TEXT,
  ADD COLUMN IF NOT EXISTS "gruppo_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "cost_center_rule" "CostCenterRule" NOT NULL DEFAULT 'DEFAULT_STR',
  ADD COLUMN IF NOT EXISTS "system_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_system_key_key" ON "accounts"("system_key");
CREATE INDEX IF NOT EXISTS "accounts_mastro_code_idx" ON "accounts"("mastro_code");

-- -----------------------------------------------------------------------------
-- journal_entries: centro di costo del movimento (nullable: il codice
-- esistente non lo valorizza ancora, il NOT NULL è un follow-up successivo
-- al deploy) e azienda.
-- -----------------------------------------------------------------------------
ALTER TABLE "journal_entries"
  ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT,
  ADD COLUMN IF NOT EXISTS "azienda" TEXT NOT NULL DEFAULT 'WEISS S.r.l.';
CREATE INDEX IF NOT EXISTS "journal_entries_cost_center_id_idx" ON "journal_entries"("cost_center_id");
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_cost_center_id_fkey"
    FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- daily_closures: centro di costo (stesso pattern di journal_entries).
-- -----------------------------------------------------------------------------
ALTER TABLE "daily_closures"
  ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT;
CREATE INDEX IF NOT EXISTS "daily_closures_cost_center_id_idx" ON "daily_closures"("cost_center_id");
DO $$ BEGIN
  ALTER TABLE "daily_closures" ADD CONSTRAINT "daily_closures_cost_center_id_fkey"
    FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- daily_expenses: centro di costo (stesso pattern di journal_entries).
-- -----------------------------------------------------------------------------
ALTER TABLE "daily_expenses"
  ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT;
CREATE INDEX IF NOT EXISTS "daily_expenses_cost_center_id_idx" ON "daily_expenses"("cost_center_id");
DO $$ BEGIN
  ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_cost_center_id_fkey"
    FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- schedule_rules: centro di costo esplicito e opzionale della regola dello
-- scadenzario (logica nel Task 6, UI nel Task 13).
-- -----------------------------------------------------------------------------
ALTER TABLE "schedule_rules"
  ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT;
CREATE INDEX IF NOT EXISTS "schedule_rules_cost_center_id_idx" ON "schedule_rules"("cost_center_id");
DO $$ BEGIN
  ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_cost_center_id_fkey"
    FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
