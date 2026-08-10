-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AccountType" AS ENUM ('RICAVO', 'COSTO', 'ATTIVO', 'PASSIVO');

-- CreateEnum
CREATE TYPE "public"."AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."AnomalyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_FIXED');

-- CreateEnum
CREATE TYPE "public"."AnomalyType" AS ENUM ('EARLY_CLOCK_IN', 'LATE_CLOCK_IN', 'EARLY_CLOCK_OUT', 'LATE_CLOCK_OUT', 'OUTSIDE_LOCATION', 'MISSING_CLOCK_OUT', 'OVERTIME', 'MISSING_BREAK', 'SHORT_BREAK', 'INVALID_TIMESTAMP');

-- CreateEnum
CREATE TYPE "public"."AssignmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'SWAPPED', 'ABSENT', 'WORKED');

-- CreateEnum
CREATE TYPE "public"."BenchmarkComparison" AS ENUM ('LESS_THAN', 'GREATER_THAN', 'EQUAL');

-- CreateEnum
CREATE TYPE "public"."BudgetAlertType" AS ENUM ('OVER_BUDGET', 'UNDER_REVENUE');

-- CreateEnum
CREATE TYPE "public"."BudgetCategoryType" AS ENUM ('REVENUE', 'COST', 'KPI', 'TAX', 'INVESTMENT', 'VAT');

-- CreateEnum
CREATE TYPE "public"."BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."CashFlowAlertStatus" AS ENUM ('ATTIVO', 'RISOLTO', 'IGNORATO');

-- CreateEnum
CREATE TYPE "public"."CashFlowAlertType" AS ENUM ('SOTTO_SOGLIA', 'SOPRA_SOGLIA', 'SALDO_NEGATIVO', 'VARIANZA_ALTA');

-- CreateEnum
CREATE TYPE "public"."CertificationType" AS ENUM ('HACCP', 'SICUREZZA', 'ANTINCENDIO', 'PRIMO_SOCCORSO', 'PREPOSTO');

-- CreateEnum
CREATE TYPE "public"."ClosureStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."CommunicationPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "public"."ConfidenceLevel" AS ENUM ('CERTA', 'ALTA', 'MEDIA', 'BASSA');

-- CreateEnum
CREATE TYPE "public"."ConstraintType" AS ENUM ('AVAILABILITY', 'MAX_HOURS', 'MIN_REST', 'PREFERRED_SHIFT', 'BLOCKED_DAY', 'SKILL_REQUIRED', 'CONSECUTIVE_DAYS');

-- CreateEnum
CREATE TYPE "public"."ContractType" AS ENUM ('TEMPO_DETERMINATO', 'TEMPO_INDETERMINATO', 'LAVORO_INTERMITTENTE', 'LAVORATORE_OCCASIONALE', 'LIBERO_PROFESSIONISTA');

-- CreateEnum
CREATE TYPE "public"."CorrectionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."DocumentCategory" AS ENUM ('CEDOLINI', 'ATTESTATI', 'ALTRO');

-- CreateEnum
CREATE TYPE "public"."DocumentType" AS ENUM ('FATTURA', 'DDT', 'RICEVUTA', 'PERSONALE', 'NONE');

-- CreateEnum
CREATE TYPE "public"."ExpenseFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "public"."FlowType" AS ENUM ('ENTRATA', 'USCITA');

-- CreateEnum
CREATE TYPE "public"."ForecastMethod" AS ENUM ('HISTORICAL', 'MOVING_AVERAGE', 'HYBRID');

-- CreateEnum
CREATE TYPE "public"."ForecastStatus" AS ENUM ('BOZZA', 'ATTIVA', 'ARCHIVIATA');

-- CreateEnum
CREATE TYPE "public"."ForecastType" AS ENUM ('BASE', 'OTTIMISTICO', 'PESSIMISTICO', 'PERSONALIZZATO');

-- CreateEnum
CREATE TYPE "public"."ImportSource" AS ENUM ('CSV', 'XLSX', 'PSD2_FABRICK', 'PSD2_TINK', 'MANUAL', 'CBI_XML', 'CBI_TXT');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('IMPORTED', 'MATCHED', 'CATEGORIZED', 'RECORDED', 'PAID');

-- CreateEnum
CREATE TYPE "public"."LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('SHIFT_PUBLISHED', 'SHIFT_REMINDER', 'SHIFT_SWAP_REQUEST', 'SHIFT_SWAP_APPROVED', 'SHIFT_SWAP_REJECTED', 'ANOMALY_CREATED', 'ANOMALY_RESOLVED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_REMINDER', 'NEW_LEAVE_REQUEST', 'STAFF_ANOMALY', 'GENERAL', 'NEW_DOCUMENT', 'CORRECTION_APPROVED', 'CORRECTION_REJECTED', 'NEW_CORRECTION_REQUEST', 'CLOCK_REMINDER', 'COMPANY_COMMUNICATION');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('BOZZA', 'DA_APPROVARE', 'DISPOSTO', 'COMPLETATO', 'FALLITO', 'ANNULLATO');

-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('BONIFICO', 'F24', 'ALTRO');

-- CreateEnum
CREATE TYPE "public"."PriceAlertStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'APPROVED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "public"."PriceAlertType" AS ENUM ('INCREASE', 'DECREASE', 'NEW_PRODUCT', 'NEW_SUPPLIER');

-- CreateEnum
CREATE TYPE "public"."PunchMethod" AS ENUM ('APP', 'WEB', 'QR_CODE', 'MANUAL', 'OFFLINE_SYNC');

-- CreateEnum
CREATE TYPE "public"."PunchType" AS ENUM ('IN', 'OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "public"."ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'TO_REVIEW', 'MANUAL', 'IGNORED', 'UNMATCHED');

-- CreateEnum
CREATE TYPE "public"."RecurrenceType" AS ENUM ('SETTIMANALE', 'MENSILE', 'BIMESTRALE', 'TRIMESTRALE', 'SEMESTRALE', 'ANNUALE', 'BISETTIMANALE');

-- CreateEnum
CREATE TYPE "public"."RegisterType" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "public"."RelConstraintType" AS ENUM ('SAME_DAY_OFF', 'NEVER_TOGETHER', 'ALWAYS_TOGETHER', 'MIN_OVERLAP', 'MAX_TOGETHER');

-- CreateEnum
CREATE TYPE "public"."RuleDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "public"."ScheduleDocumentType" AS ENUM ('FATTURA_VENDITA', 'FATTURA_ACQUISTO', 'NOTA_CREDITO', 'NOTA_DEBITO', 'STIPENDIO', 'TASSA_F24', 'CONTRIBUTO', 'AFFITTO', 'UTENZA', 'RATA_PRESTITO', 'ALTRO');

-- CreateEnum
CREATE TYPE "public"."SchedulePaymentMethod" AS ENUM ('BONIFICO', 'RIBA', 'SDD', 'CARTA', 'CONTANTI', 'F24', 'ALTRO', 'ASSEGNO', 'BOLLETTINO', 'CREDITO_FISCALE', 'SENZA_INCASSO');

-- CreateEnum
CREATE TYPE "public"."SchedulePriority" AS ENUM ('BASSA', 'NORMALE', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "public"."ScheduleReconciliationSource" AS ENUM ('MANUAL', 'AUTOMATIC', 'PROPOSAL', 'RULE');

-- CreateEnum
CREATE TYPE "public"."ScheduleReconciliationStatus" AS ENUM ('VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ScheduleSource" AS ENUM ('MANUALE', 'IMPORT_CSV', 'IMPORT_FATTURE_SDI', 'RICORRENZA_AUTO');

-- CreateEnum
CREATE TYPE "public"."ScheduleStatus" AS ENUM ('DRAFT', 'GENERATED', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ScheduleType" AS ENUM ('ATTIVA', 'PASSIVA');

-- CreateEnum
CREATE TYPE "public"."Shift" AS ENUM ('MORNING', 'EVENING');

-- CreateEnum
CREATE TYPE "public"."ShiftScheduleStatus" AS ENUM ('DRAFT', 'GENERATED', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."SwapStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."TrackingMode" AS ENUM ('GPS_GEOFENCE', 'MANUAL_HOURS', 'VIEW_ONLY');

-- CreateTable
CREATE TABLE "public"."account_budget_mappings" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "budget_category_id" TEXT NOT NULL,
    "include_in_budget" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_budget_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."AccountType" NOT NULL,
    "category" TEXT,
    "parent_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."attendance_anomalies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "record_id" TEXT,
    "assignment_id" TEXT,
    "anomaly_type" "public"."AnomalyType" NOT NULL,
    "status" "public"."AnomalyStatus" NOT NULL DEFAULT 'PENDING',
    "date" DATE NOT NULL,
    "description" TEXT,
    "expected_value" TEXT,
    "actual_value" TEXT,
    "difference_minutes" INTEGER,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "hours_affected" DECIMAL(4,2),
    "cost_impact" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."attendance_correction_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "work_location_id" TEXT,
    "date" DATE NOT NULL,
    "requested_clock_in" TIMESTAMP(3),
    "requested_clock_out" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "public"."CorrectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "anomaly_id" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."attendance_policies" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "geo_fence_radius" INTEGER NOT NULL DEFAULT 100,
    "require_geolocation" BOOLEAN NOT NULL DEFAULT true,
    "block_outside_location" BOOLEAN NOT NULL DEFAULT false,
    "early_clock_in_minutes" INTEGER NOT NULL DEFAULT 15,
    "late_clock_in_minutes" INTEGER NOT NULL DEFAULT 10,
    "early_clock_out_minutes" INTEGER NOT NULL DEFAULT 5,
    "late_clock_out_minutes" INTEGER NOT NULL DEFAULT 30,
    "auto_clock_out_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_clock_out_hours" INTEGER NOT NULL DEFAULT 12,
    "require_break_punch" BOOLEAN NOT NULL DEFAULT false,
    "min_break_minutes" INTEGER NOT NULL DEFAULT 30,
    "notify_on_anomaly" BOOLEAN NOT NULL DEFAULT true,
    "notify_manager_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "require_exit_note" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."attendance_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "punch_type" "public"."PunchType" NOT NULL,
    "punch_method" "public"."PunchMethod" NOT NULL DEFAULT 'APP',
    "punched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accuracy" DECIMAL(6,2),
    "distance_from_venue" DECIMAL(8,2),
    "is_within_radius" BOOLEAN NOT NULL DEFAULT true,
    "device_info" TEXT,
    "ip_address" TEXT,
    "notes" TEXT,
    "is_manual" BOOLEAN NOT NULL DEFAULT false,
    "manual_entry_by" TEXT,
    "manual_entry_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "work_location_id" TEXT,
    "correction_request_id" TEXT,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "venue_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bank_accounts" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" "public"."RegisterType" NOT NULL,
    "bank_name" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "initial_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "notes" TEXT,
    "open_banking_ready" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "iban_hash" TEXT,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bank_transactions" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "value_date" DATE,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2),
    "bank_reference" VARCHAR(100),
    "import_batch_id" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "import_source" "public"."ImportSource" NOT NULL DEFAULT 'CSV',
    "status" "public"."ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "matched_entry_id" TEXT,
    "match_confidence" DECIMAL(3,2),
    "reconciled_by" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."budget_alerts" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "account_id" TEXT,
    "month" INTEGER,
    "alert_type" "public"."BudgetAlertType" NOT NULL,
    "budget_amount" DECIMAL(12,2) NOT NULL,
    "actual_amount" DECIMAL(12,2) NOT NULL,
    "variance_amount" DECIMAL(12,2) NOT NULL,
    "variance_percent" DECIMAL(5,2) NOT NULL,
    "status" "public"."AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledged_by" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category_id" TEXT,

    CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."budget_categories" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "category_type" "public"."BudgetCategoryType" NOT NULL DEFAULT 'COST',
    "color" TEXT,
    "icon" TEXT,
    "benchmark_percentage" DECIMAL(5,2),
    "benchmark_comparison" "public"."BenchmarkComparison" NOT NULL DEFAULT 'LESS_THAN',
    "alert_threshold_percent" DECIMAL(5,2),
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."budget_lines" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "jan" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feb" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mar" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "apr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "may" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "jun" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "jul" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aug" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sep" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "oct" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "nov" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dec" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "annual_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "budget_category_id" TEXT,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."budget_targets" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "target_revenue" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."budgets" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT,
    "status" "public"."BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_counts" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "bills_500" INTEGER NOT NULL DEFAULT 0,
    "bills_200" INTEGER NOT NULL DEFAULT 0,
    "bills_100" INTEGER NOT NULL DEFAULT 0,
    "bills_50" INTEGER NOT NULL DEFAULT 0,
    "bills_20" INTEGER NOT NULL DEFAULT 0,
    "bills_10" INTEGER NOT NULL DEFAULT 0,
    "bills_5" INTEGER NOT NULL DEFAULT 0,
    "coins_2" INTEGER NOT NULL DEFAULT 0,
    "coins_1" INTEGER NOT NULL DEFAULT 0,
    "coins_050" INTEGER NOT NULL DEFAULT 0,
    "coins_020" INTEGER NOT NULL DEFAULT 0,
    "coins_010" INTEGER NOT NULL DEFAULT 0,
    "coins_005" INTEGER NOT NULL DEFAULT 0,
    "coins_002" INTEGER NOT NULL DEFAULT 0,
    "coins_001" INTEGER NOT NULL DEFAULT 0,
    "total_counted" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expected_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_flow_alerts" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "forecast_id" TEXT,
    "tipo" "public"."CashFlowAlertType" NOT NULL,
    "data_prevista" DATE NOT NULL,
    "saldo_previsto" DECIMAL(12,2) NOT NULL,
    "soglia" DECIMAL(12,2),
    "messaggio" TEXT,
    "stato" "public"."CashFlowAlertStatus" NOT NULL DEFAULT 'ATTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_flow_forecast_lines" (
    "id" TEXT NOT NULL,
    "forecast_id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "public"."FlowType" NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "categoria" TEXT,
    "descrizione" TEXT,
    "fonte" TEXT,
    "confidenza" "public"."ConfidenceLevel" NOT NULL DEFAULT 'CERTA',
    "saldo_progressivo" DECIMAL(12,2),
    "is_realizzata" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_forecast_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_flow_forecasts" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "data_inizio" DATE NOT NULL,
    "data_fine" DATE NOT NULL,
    "saldo_iniziale" DECIMAL(12,2) NOT NULL,
    "saldo_finale" DECIMAL(12,2) NOT NULL,
    "totale_entrare" DECIMAL(12,2) NOT NULL,
    "totale_uscite" DECIMAL(12,2) NOT NULL,
    "stato" "public"."ForecastStatus" NOT NULL DEFAULT 'BOZZA',
    "tipo" "public"."ForecastType" NOT NULL DEFAULT 'BASE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "cash_flow_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_flow_scenarios" (
    "id" TEXT NOT NULL,
    "forecast_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "tipo_aggiustamento" TEXT,
    "importi_modificati" BOOLEAN NOT NULL DEFAULT false,
    "date_modificate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_flow_settings" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "low_balance_threshold" DECIMAL(12,2) NOT NULL DEFAULT 5000,
    "forecast_method" "public"."ForecastMethod" NOT NULL DEFAULT 'HYBRID',
    "moving_average_days" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_station_templates" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_event_only" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cash_station_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_stations" (
    "id" TEXT NOT NULL,
    "closure_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "receipt_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "receipt_vat" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "invoice_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "invoice_vat" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "suspended_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cash_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pos_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "non_receipt_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "float_amount" DECIMAL(10,2) NOT NULL DEFAULT 114.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categorization_rules" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "public"."RuleDirection" NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "budget_category_id" TEXT,
    "account_id" TEXT,
    "auto_verify" BOOLEAN NOT NULL DEFAULT false,
    "auto_hide" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorization_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."certifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "public"."CertificationType" NOT NULL,
    "obtained_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "document_url" TEXT,
    "document_uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."clock_reminder_recipients" (
    "id" TEXT NOT NULL,
    "reminder_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "clock_reminder_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."clock_reminders" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "punch_type" "public"."PunchType" NOT NULL,
    "time_minutes" INTEGER NOT NULL,
    "days_of_week" INTEGER[],
    "skip_if_punched" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clock_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."communication_reads" (
    "id" TEXT NOT NULL,
    "communication_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."communications" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "public"."CommunicationPriority" NOT NULL DEFAULT 'NORMAL',
    "event_date" DATE,
    "expires_at" TIMESTAMP(3),
    "target_roles" TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customers" (
    "id" TEXT NOT NULL,
    "denominazione" TEXT NOT NULL,
    "partita_iva" TEXT,
    "codice_fiscale" TEXT,
    "indirizzo" TEXT,
    "citta" TEXT,
    "cap" TEXT,
    "provincia" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "iban" TEXT,
    "note" TEXT,
    "default_account_id" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_attendance" (
    "id" TEXT NOT NULL,
    "closure_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shift" "public"."Shift" NOT NULL,
    "hours" DECIMAL(4,1),
    "status_code" TEXT,
    "hourly_rate" DECIMAL(10,2),
    "total_pay" DECIMAL(10,2),
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_closures" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weather_morning" TEXT,
    "weather_afternoon" TEXT,
    "weather_evening" TEXT,
    "notes" TEXT,
    "is_event" BOOLEAN NOT NULL DEFAULT false,
    "event_name" TEXT,
    "status" "public"."ClosureStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3),
    "validated_by" TEXT,
    "validated_at" TIMESTAMP(3),
    "rejection_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "daily_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_expenses" (
    "id" TEXT NOT NULL,
    "closure_id" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "description" TEXT,
    "document_ref" TEXT,
    "document_type" "public"."DocumentType" NOT NULL DEFAULT 'NONE',
    "amount" DECIMAL(10,2) NOT NULL,
    "vat_amount" DECIMAL(10,2),
    "account_id" TEXT,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "paid_by" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."electronic_invoices" (
    "id" TEXT NOT NULL,
    "sdi_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "supplier_id" TEXT,
    "supplier_vat" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "vat_amount" DECIMAL(10,2) NOT NULL,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'IMPORTED',
    "account_id" TEXT,
    "xml_content" TEXT,
    "file_name" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "recorded_at" TIMESTAMP(3),
    "journal_entry_id" TEXT,
    "venue_id" TEXT NOT NULL,
    "created_by" TEXT,
    "notes" TEXT,
    "causale" TEXT,
    "document_type" TEXT DEFAULT 'TD01',
    "line_items" JSONB,
    "references" JSONB,
    "vat_summary" JSONB,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "electronic_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."employee_constraints" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT,
    "constraint_type" "public"."ConstraintType" NOT NULL,
    "config" JSONB NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "is_hard_constraint" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "employee_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."employee_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "public"."DocumentCategory" NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "period" TEXT,
    "period_label" TEXT,
    "description" TEXT,
    "uploaded_by_user_id" TEXT NOT NULL,
    "upload_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "needs_assignment" BOOLEAN NOT NULL DEFAULT false,
    "unmatched_text" TEXT,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."hourly_partials" (
    "id" TEXT NOT NULL,
    "closure_id" TEXT NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "receipt_progressive" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pos_progressive" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "coffee_counter" INTEGER,
    "coffee_delta" INTEGER,
    "weather" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hourly_partials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."import_batches" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "filename" TEXT,
    "source" "public"."ImportSource" NOT NULL,
    "record_count" INTEGER NOT NULL,
    "duplicates_skipped" INTEGER NOT NULL DEFAULT 0,
    "errors_count" INTEGER NOT NULL DEFAULT 0,
    "imported_by" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."initial_balances" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "cash_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "initial_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invitation_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "invited_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoice_deadlines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iban" TEXT,

    CONSTRAINT "invoice_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoice_line_accounts" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "numero_linea" INTEGER NOT NULL,
    "descrizione" TEXT NOT NULL,
    "codice_articolo" TEXT,
    "importo" DECIMAL(10,2) NOT NULL,
    "account_id" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'proposta',
    "fonte" TEXT NOT NULL,
    "confidence" DECIMAL(3,2),
    "motivazione_ai" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."journal_entries" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "register_type" "public"."RegisterType" NOT NULL,
    "document_ref" TEXT,
    "document_type" TEXT,
    "description" TEXT NOT NULL,
    "debit_amount" DECIMAL(10,2),
    "credit_amount" DECIMAL(10,2),
    "vat_amount" DECIMAL(10,2),
    "account_id" TEXT,
    "counterpart_id" TEXT,
    "closure_id" TEXT,
    "running_balance" DECIMAL(12,2),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "applied_rule_id" TEXT,
    "budget_category_id" TEXT,
    "categorization_source" TEXT,
    "counterpart_name" TEXT,
    "hidden_at" TIMESTAMP(3),
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "payment_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "transfer_id" TEXT,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."journal_entry_allocations" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "origine" TEXT NOT NULL,
    "reconciliation_id" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entry_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leave_balances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "accrued" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "pending" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carried_over" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leave_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_partial_day" BOOLEAN NOT NULL DEFAULT false,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "days_requested" DECIMAL(4,2),
    "hours_requested" DECIMAL(5,2),
    "status" "public"."LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "document_url" TEXT,
    "document_uploaded_at" TIMESTAMP(3),
    "notes" TEXT,
    "manager_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leave_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "max_days_advance" INTEGER,
    "min_days_advance" INTEGER,
    "affects_accrual" BOOLEAN NOT NULL DEFAULT true,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "channel" "public"."NotificationChannel" NOT NULL DEFAULT 'PUSH',
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'SENT',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "error_msg" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "new_shift_published" BOOLEAN NOT NULL DEFAULT true,
    "shift_reminder" BOOLEAN NOT NULL DEFAULT true,
    "shift_reminder_minutes" INTEGER NOT NULL DEFAULT 60,
    "shift_swap_request" BOOLEAN NOT NULL DEFAULT true,
    "anomaly_created" BOOLEAN NOT NULL DEFAULT true,
    "anomaly_resolved" BOOLEAN NOT NULL DEFAULT true,
    "leave_approved" BOOLEAN NOT NULL DEFAULT true,
    "leave_rejected" BOOLEAN NOT NULL DEFAULT true,
    "leave_reminder" BOOLEAN NOT NULL DEFAULT true,
    "new_leave_request" BOOLEAN NOT NULL DEFAULT true,
    "staff_anomaly" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "new_document" BOOLEAN NOT NULL DEFAULT true,
    "correction_approved" BOOLEAN NOT NULL DEFAULT true,
    "correction_rejected" BOOLEAN NOT NULL DEFAULT true,
    "new_correction_request" BOOLEAN NOT NULL DEFAULT true,
    "clock_reminder" BOOLEAN NOT NULL DEFAULT true,
    "company_communication" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "tipo" "public"."PaymentType" NOT NULL,
    "stato" "public"."PaymentStatus" NOT NULL DEFAULT 'BOZZA',
    "riferimento_interno" TEXT,
    "data_esecuzione" DATE NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "beneficiario_nome" TEXT NOT NULL,
    "beneficiario_iban" TEXT,
    "causale" TEXT,
    "journal_entry_id" TEXT,
    "created_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."price_alerts" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "alert_type" "public"."PriceAlertType" NOT NULL,
    "old_price" DECIMAL(10,4) NOT NULL,
    "new_price" DECIMAL(10,4) NOT NULL,
    "change_percent" DECIMAL(5,2) NOT NULL,
    "supplier_id" TEXT,
    "invoice_id" TEXT,
    "invoice_date" DATE NOT NULL,
    "status" "public"."PriceAlertStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."price_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "quantity" DECIMAL(10,3),
    "total_price" DECIMAL(10,2),
    "supplier_id" TEXT,
    "invoice_id" TEXT,
    "invoice_number" TEXT,
    "invoice_date" DATE NOT NULL,
    "previous_price" DECIMAL(10,4),
    "price_change" DECIMAL(10,4),
    "price_change_pct" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT,
    "name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "unit" TEXT,
    "last_price" DECIMAL(10,4),
    "last_price_date" DATE,
    "last_supplier_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_name" TEXT,
    "device_type" TEXT,
    "browser_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recurrences" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "categoria_id" TEXT,
    "conto_di_pagamento_id" TEXT,
    "metodo_pagamento" TEXT,
    "frequenza" TEXT NOT NULL,
    "giorno_del_mese" INTEGER,
    "giorno_della_settimana" INTEGER,
    "data_inizio" DATE NOT NULL,
    "data_fine" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "prossima_generazione" DATE,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recurring_expenses" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "public"."ExpenseFrequency" NOT NULL,
    "day_of_month" INTEGER,
    "day_of_week" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "account_id" TEXT,
    "category" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."register_balances" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "register_type" "public"."RegisterType" NOT NULL,
    "date" DATE NOT NULL,
    "opening_balance" DECIMAL(12,2) NOT NULL,
    "total_debits" DECIMAL(12,2) NOT NULL,
    "total_credits" DECIMAL(12,2) NOT NULL,
    "closing_balance" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "register_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."relationship_constraint_users" (
    "constraint_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "relationship_constraint_users_pkey" PRIMARY KEY ("constraint_id","user_id")
);

-- CreateTable
CREATE TABLE "public"."relationship_constraints" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT,
    "constraint_type" "public"."RelConstraintType" NOT NULL,
    "config" JSONB NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "is_hard_constraint" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "relationship_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedule_attachments" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedule_payments" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "data_pagamento" DATE NOT NULL,
    "metodo" TEXT,
    "riferimento" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedule_reconciliations" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "status" "public"."ScheduleReconciliationStatus" NOT NULL DEFAULT 'VERIFIED',
    "source" "public"."ScheduleReconciliationSource" NOT NULL DEFAULT 'MANUAL',
    "amount" DECIMAL(10,2) NOT NULL,
    "confidence" DECIMAL(3,2),
    "payment_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedule_reminders" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "giorni_prima" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'in_app',
    "messaggio" TEXT,
    "inviato" BOOLEAN NOT NULL DEFAULT false,
    "data_invio" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedule_rules" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "direzione" TEXT NOT NULL,
    "tipo_documento" TEXT,
    "tipo_pagamento" TEXT,
    "azione" TEXT NOT NULL DEFAULT 'crea_riconcilia_movimento',
    "conto_id" TEXT,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "bank_account_id" TEXT,

    CONSTRAINT "schedule_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedules" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'aperta',
    "descrizione" TEXT NOT NULL,
    "importo_totale" DECIMAL(10,2) NOT NULL,
    "importo_pagato" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "data_scadenza" DATE NOT NULL,
    "data_emissione" DATE,
    "data_pagamento" DATE,
    "tipo_documento" TEXT,
    "numero_documento" TEXT,
    "riferimento_documento" TEXT,
    "controparte_nome" TEXT,
    "controparte_iban" TEXT,
    "supplier_id" TEXT,
    "priorita" TEXT NOT NULL DEFAULT 'normale',
    "metodo_pagamento" TEXT,
    "is_ricorrente" BOOLEAN NOT NULL DEFAULT false,
    "ricorrenza_tipo" TEXT,
    "ricorrenza_fine" DATE,
    "ricorrenza_prossima_generazione" TIMESTAMP(3),
    "ricorrenza_attiva" BOOLEAN NOT NULL DEFAULT true,
    "ricorrenza_parent_id" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manuale',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "recurrence_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "invoice_deadline_id" TEXT,
    "invoice_id" TEXT,
    "data_attesa" DATE,
    "verificata" BOOLEAN NOT NULL DEFAULT false,
    "data_attesa_source" TEXT,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shift_assignments" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shift_definition_id" TEXT,
    "date" DATE NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "venue_id" TEXT NOT NULL,
    "work_station" TEXT,
    "status" "public"."AssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "swap_requested_by" TEXT,
    "swap_with_user_id" TEXT,
    "swap_status" "public"."SwapStatus",
    "hours_scheduled" DECIMAL(4,2),
    "hourly_rate_applied" DECIMAL(10,2),
    "cost_estimated" DECIMAL(10,2),
    "actual_start" TIME(6),
    "actual_end" TIME(6),
    "hours_worked" DECIMAL(4,2),
    "cost_actual" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shift_definitions" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "min_staff" INTEGER NOT NULL DEFAULT 1,
    "max_staff" INTEGER,
    "required_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rate_multiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shift_schedules" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "public"."ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "generation_params" JSONB,
    "generation_log" JSONB,
    "generation_score" DECIMAL(5,2),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" TEXT,
    "published_at" TIMESTAMP(3),
    "notes" TEXT,
    "staffing_requirements" JSONB,

    CONSTRAINT "shift_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."supplier_product_accounts" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "nome_normalizzato" TEXT NOT NULL,
    "codice_articolo" TEXT,
    "account_id" TEXT NOT NULL,
    "conferme" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_product_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vat_number" TEXT,
    "address" TEXT,
    "default_account_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "city" TEXT,
    "fiscal_code" TEXT,
    "postal_code" TEXT,
    "province" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" TEXT DEFAULT 'IT',
    "email" TEXT,
    "iban" TEXT,
    "fiscal_code_hash" TEXT,
    "payment_terms_days" INTEGER,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."timekeeping_policies" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "day_start_minutes" INTEGER NOT NULL,
    "day_end_minutes" INTEGER NOT NULL,
    "lunch_start_minutes" INTEGER,
    "lunch_end_minutes" INTEGER,
    "flex_minutes" INTEGER NOT NULL DEFAULT 0,
    "rounding_minutes" INTEGER NOT NULL DEFAULT 1,
    "rounding_tolerance_minutes" INTEGER NOT NULL DEFAULT 0,
    "rounding_out_minutes" INTEGER,
    "rounding_out_tolerance_minutes" INTEGER,
    "max_daily_minutes" INTEGER,
    "contract_weekly_hours" DECIMAL(4,1),
    "saturday_as_overtime" BOOLEAN NOT NULL DEFAULT false,
    "block_sunday" BOOLEAN NOT NULL DEFAULT false,
    "single_punch_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "use_shift_as_window" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "timekeeping_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."timekeeping_policy_breaks" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_minutes" INTEGER NOT NULL,
    "end_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timekeeping_policy_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."timekeeping_policy_versions" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "effective_until" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "day_start_minutes" INTEGER NOT NULL,
    "day_end_minutes" INTEGER NOT NULL,
    "lunch_start_minutes" INTEGER,
    "lunch_end_minutes" INTEGER,
    "use_shift_as_window" BOOLEAN NOT NULL,
    "flex_minutes" INTEGER NOT NULL,
    "rounding_minutes" INTEGER NOT NULL,
    "rounding_tolerance_minutes" INTEGER NOT NULL,
    "rounding_out_minutes" INTEGER,
    "rounding_out_tolerance_minutes" INTEGER,
    "max_daily_minutes" INTEGER,
    "contract_weekly_hours" DECIMAL(4,1),
    "saturday_as_overtime" BOOLEAN NOT NULL,
    "block_sunday" BOOLEAN NOT NULL,
    "single_punch_mode" BOOLEAN NOT NULL,
    "extra_breaks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timekeeping_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "venue_id" TEXT,
    "hourly_rate" DECIMAL(10,2),
    "is_fixed_staff" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "default_shift" "public"."Shift",
    "app_token" TEXT,
    "can_handle_cash" BOOLEAN NOT NULL DEFAULT true,
    "can_work_alone" BOOLEAN NOT NULL DEFAULT false,
    "contract_hours_week" DECIMAL(4,1),
    "contract_type" "public"."ContractType",
    "hire_date" DATE,
    "hourly_rate_base" DECIMAL(10,2),
    "hourly_rate_extra" DECIMAL(10,2),
    "hourly_rate_holiday" DECIMAL(10,2),
    "hourly_rate_night" DECIMAL(10,2),
    "notify_email" BOOLEAN NOT NULL DEFAULT true,
    "notify_push" BOOLEAN NOT NULL DEFAULT true,
    "notify_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "portal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "portal_pin" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "termination_date" DATE,
    "whatsapp_number" TEXT,
    "available_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "available_holidays" BOOLEAN NOT NULL DEFAULT false,
    "fiscal_code" TEXT,
    "phone_number" TEXT,
    "vat_number" TEXT,
    "work_days_per_week" INTEGER,
    "address" TEXT,
    "birth_date" DATE,
    "created_by_id" TEXT,
    "last_login_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "reset_token" TEXT,
    "reset_token_expiry" TIMESTAMP(3),
    "birth_place" TEXT,
    "birth_province" TEXT,
    "city" TEXT,
    "gender" TEXT,
    "province" TEXT,
    "zip_code" TEXT,
    "timekeeping_policy_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "default_float" DECIMAL(10,2) NOT NULL DEFAULT 114.00,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."work_location_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "work_location_id" TEXT NOT NULL,
    "tracking_mode" "public"."TrackingMode" NOT NULL DEFAULT 'GPS_GEOFENCE',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_location_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."work_locations" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "geofence_radius_meters" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "timekeeping_policy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_budget_mappings_account_id_key" ON "public"."account_budget_mappings"("account_id" ASC);

-- CreateIndex
CREATE INDEX "account_budget_mappings_budget_category_id_idx" ON "public"."account_budget_mappings"("budget_category_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "public"."accounts"("code" ASC);

-- CreateIndex
CREATE INDEX "accounts_parent_id_idx" ON "public"."accounts"("parent_id" ASC);

-- CreateIndex
CREATE INDEX "attendance_anomalies_user_id_date_idx" ON "public"."attendance_anomalies"("user_id" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "attendance_anomalies_venue_id_status_idx" ON "public"."attendance_anomalies"("venue_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "attendance_correction_requests_user_id_date_idx" ON "public"."attendance_correction_requests"("user_id" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "attendance_correction_requests_venue_id_status_idx" ON "public"."attendance_correction_requests"("venue_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_venue_id_key" ON "public"."attendance_policies"("venue_id" ASC);

-- CreateIndex
CREATE INDEX "attendance_records_assignment_id_idx" ON "public"."attendance_records"("assignment_id" ASC);

-- CreateIndex
CREATE INDEX "attendance_records_user_id_punched_at_idx" ON "public"."attendance_records"("user_id" ASC, "punched_at" ASC);

-- CreateIndex
CREATE INDEX "attendance_records_venue_id_punched_at_idx" ON "public"."attendance_records"("venue_id" ASC, "punched_at" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "public"."audit_logs"("entity_type" ASC, "entity_id" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "public"."audit_logs"("timestamp" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "public"."audit_logs"("user_id" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_venue_id_idx" ON "public"."audit_logs"("venue_id" ASC);

-- CreateIndex
CREATE INDEX "bank_accounts_iban_hash_idx" ON "public"."bank_accounts"("iban_hash" ASC);

-- CreateIndex
CREATE INDEX "bank_accounts_venue_id_account_type_idx" ON "public"."bank_accounts"("venue_id" ASC, "account_type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_venue_id_iban_key" ON "public"."bank_accounts"("venue_id" ASC, "iban" ASC);

-- CreateIndex
CREATE INDEX "bank_transactions_import_batch_id_idx" ON "public"."bank_transactions"("import_batch_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_matched_entry_id_key" ON "public"."bank_transactions"("matched_entry_id" ASC);

-- CreateIndex
CREATE INDEX "bank_transactions_transaction_date_idx" ON "public"."bank_transactions"("transaction_date" ASC);

-- CreateIndex
CREATE INDEX "bank_transactions_venue_id_bank_reference_idx" ON "public"."bank_transactions"("venue_id" ASC, "bank_reference" ASC);

-- CreateIndex
CREATE INDEX "bank_transactions_venue_id_status_idx" ON "public"."bank_transactions"("venue_id" ASC, "status" ASC);

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_bank_transactions_sede_riferimento" ON "public"."bank_transactions"("venue_id" ASC, "bank_reference" ASC) WHERE "deleted_at" IS NULL AND "bank_reference" IS NOT NULL;

-- CreateIndex
CREATE INDEX "budget_alerts_category_id_idx" ON "public"."budget_alerts"("category_id" ASC);

-- CreateIndex
CREATE INDEX "budget_categories_venue_id_category_type_idx" ON "public"."budget_categories"("venue_id" ASC, "category_type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_venue_id_code_key" ON "public"."budget_categories"("venue_id" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "budget_lines_budget_category_id_idx" ON "public"."budget_lines"("budget_category_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budget_id_account_id_key" ON "public"."budget_lines"("budget_id" ASC, "account_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "budget_targets_venue_id_year_month_key" ON "public"."budget_targets"("venue_id" ASC, "year" ASC, "month" ASC);

-- CreateIndex
CREATE INDEX "budgets_venue_id_year_idx" ON "public"."budgets"("venue_id" ASC, "year" ASC);

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_budgets_sede_anno" ON "public"."budgets"("venue_id" ASC, "year" ASC) WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cash_counts_station_id_key" ON "public"."cash_counts"("station_id" ASC);

-- CreateIndex
CREATE INDEX "cash_flow_alerts_venue_id_stato_idx" ON "public"."cash_flow_alerts"("venue_id" ASC, "stato" ASC);

-- CreateIndex
CREATE INDEX "cash_flow_forecast_lines_forecast_id_data_idx" ON "public"."cash_flow_forecast_lines"("forecast_id" ASC, "data" ASC);

-- CreateIndex
CREATE INDEX "cash_flow_forecasts_venue_id_idx" ON "public"."cash_flow_forecasts"("venue_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_settings_venue_id_key" ON "public"."cash_flow_settings"("venue_id" ASC);

-- CreateIndex
CREATE INDEX "cash_stations_closure_id_idx" ON "public"."cash_stations"("closure_id" ASC);

-- CreateIndex
CREATE INDEX "categorization_rules_venue_id_idx" ON "public"."categorization_rules"("venue_id" ASC);

-- CreateIndex
CREATE INDEX "certifications_expiry_date_idx" ON "public"."certifications"("expiry_date" ASC);

-- CreateIndex
CREATE INDEX "certifications_type_idx" ON "public"."certifications"("type" ASC);

-- CreateIndex
CREATE INDEX "certifications_user_id_idx" ON "public"."certifications"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clock_reminder_recipients_reminder_id_user_id_key" ON "public"."clock_reminder_recipients"("reminder_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "clock_reminders_venue_id_is_active_idx" ON "public"."clock_reminders"("venue_id" ASC, "is_active" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "communication_reads_communication_id_user_id_key" ON "public"."communication_reads"("communication_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "communications_venue_id_expires_at_idx" ON "public"."communications"("venue_id" ASC, "expires_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_attendance_closure_id_user_id_shift_key" ON "public"."daily_attendance"("closure_id" ASC, "user_id" ASC, "shift" ASC);

-- CreateIndex
CREATE INDEX "daily_closures_venue_id_date_idx" ON "public"."daily_closures"("venue_id" ASC, "date" ASC);

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_daily_closures_sede_giorno" ON "public"."daily_closures"("venue_id" ASC, "date" ASC) WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "daily_expenses_account_id_idx" ON "public"."daily_expenses"("account_id" ASC);

-- CreateIndex
CREATE INDEX "daily_expenses_closure_id_idx" ON "public"."daily_expenses"("closure_id" ASC);

-- CreateIndex
CREATE INDEX "electronic_invoices_document_type_idx" ON "public"."electronic_invoices"("document_type" ASC);

-- CreateIndex
CREATE INDEX "electronic_invoices_invoice_date_idx" ON "public"."electronic_invoices"("invoice_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "electronic_invoices_journal_entry_id_key" ON "public"."electronic_invoices"("journal_entry_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "electronic_invoices_sdi_id_key" ON "public"."electronic_invoices"("sdi_id" ASC);

-- CreateIndex
CREATE INDEX "electronic_invoices_status_idx" ON "public"."electronic_invoices"("status" ASC);

-- CreateIndex
CREATE INDEX "electronic_invoices_supplier_id_idx" ON "public"."electronic_invoices"("supplier_id" ASC);

-- CreateIndex
CREATE INDEX "electronic_invoices_venue_id_idx" ON "public"."electronic_invoices"("venue_id" ASC);

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_electronic_invoices_numero_data_piva" ON "public"."electronic_invoices"("invoice_number" ASC, "invoice_date" ASC, "supplier_vat" ASC) WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "employee_constraints_constraint_type_idx" ON "public"."employee_constraints"("constraint_type" ASC);

-- CreateIndex
CREATE INDEX "employee_constraints_user_id_idx" ON "public"."employee_constraints"("user_id" ASC);

-- CreateIndex
CREATE INDEX "employee_documents_needs_assignment_idx" ON "public"."employee_documents"("needs_assignment" ASC);

-- CreateIndex
CREATE INDEX "employee_documents_user_id_category_idx" ON "public"."employee_documents"("user_id" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "employee_documents_user_id_period_idx" ON "public"."employee_documents"("user_id" ASC, "period" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "hourly_partials_closure_id_timeSlot_key" ON "public"."hourly_partials"("closure_id" ASC, "timeSlot" ASC);

-- CreateIndex
CREATE INDEX "import_batches_imported_at_idx" ON "public"."import_batches"("imported_at" ASC);

-- CreateIndex
CREATE INDEX "import_batches_venue_id_idx" ON "public"."import_batches"("venue_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "initial_balances_venue_id_year_key" ON "public"."initial_balances"("venue_id" ASC, "year" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokens_created_user_id_key" ON "public"."invitation_tokens"("created_user_id" ASC);

-- CreateIndex
CREATE INDEX "invitation_tokens_email_idx" ON "public"."invitation_tokens"("email" ASC);

-- CreateIndex
CREATE INDEX "invitation_tokens_token_idx" ON "public"."invitation_tokens"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokens_token_key" ON "public"."invitation_tokens"("token" ASC);

-- CreateIndex
CREATE INDEX "invoice_deadlines_due_date_idx" ON "public"."invoice_deadlines"("due_date" ASC);

-- CreateIndex
CREATE INDEX "invoice_deadlines_is_paid_idx" ON "public"."invoice_deadlines"("is_paid" ASC);

-- CreateIndex
CREATE INDEX "invoice_line_accounts_invoice_id_idx" ON "public"."invoice_line_accounts"("invoice_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_accounts_invoice_id_numero_linea_key" ON "public"."invoice_line_accounts"("invoice_id" ASC, "numero_linea" ASC);

-- CreateIndex
CREATE INDEX "journal_entries_account_id_idx" ON "public"."journal_entries"("account_id" ASC);

-- CreateIndex
CREATE INDEX "journal_entries_budget_category_id_idx" ON "public"."journal_entries"("budget_category_id" ASC);

-- CreateIndex
CREATE INDEX "journal_entries_closure_id_idx" ON "public"."journal_entries"("closure_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_payment_id_key" ON "public"."journal_entries"("payment_id" ASC);

-- CreateIndex
CREATE INDEX "journal_entries_transfer_id_idx" ON "public"."journal_entries"("transfer_id" ASC);

-- CreateIndex
CREATE INDEX "journal_entries_venue_id_date_idx" ON "public"."journal_entries"("venue_id" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "journal_entries_venue_id_register_type_date_idx" ON "public"."journal_entries"("venue_id" ASC, "register_type" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "journal_entry_allocations_account_id_idx" ON "public"."journal_entry_allocations"("account_id" ASC);

-- CreateIndex
CREATE INDEX "journal_entry_allocations_journal_entry_id_idx" ON "public"."journal_entry_allocations"("journal_entry_id" ASC);

-- CreateIndex
CREATE INDEX "journal_entry_allocations_reconciliation_id_idx" ON "public"."journal_entry_allocations"("reconciliation_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_user_id_leave_type_id_year_key" ON "public"."leave_balances"("user_id" ASC, "leave_type_id" ASC, "year" ASC);

-- CreateIndex
CREATE INDEX "leave_requests_start_date_end_date_idx" ON "public"."leave_requests"("start_date" ASC, "end_date" ASC);

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "public"."leave_requests"("status" ASC);

-- CreateIndex
CREATE INDEX "leave_requests_user_id_idx" ON "public"."leave_requests"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "public"."leave_types"("code" ASC);

-- CreateIndex
CREATE INDEX "notification_logs_type_status_idx" ON "public"."notification_logs"("type" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "notification_logs_user_id_sent_at_idx" ON "public"."notification_logs"("user_id" ASC, "sent_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "public"."notification_preferences"("user_id" ASC);

-- CreateIndex
CREATE INDEX "payments_data_esecuzione_idx" ON "public"."payments"("data_esecuzione" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_journal_entry_id_key" ON "public"."payments"("journal_entry_id" ASC);

-- CreateIndex
CREATE INDEX "payments_venue_id_stato_idx" ON "public"."payments"("venue_id" ASC, "stato" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "public"."permissions"("code" ASC);

-- CreateIndex
CREATE INDEX "price_alerts_created_at_idx" ON "public"."price_alerts"("created_at" ASC);

-- CreateIndex
CREATE INDEX "price_alerts_product_id_idx" ON "public"."price_alerts"("product_id" ASC);

-- CreateIndex
CREATE INDEX "price_alerts_status_idx" ON "public"."price_alerts"("status" ASC);

-- CreateIndex
CREATE INDEX "price_history_invoice_date_idx" ON "public"."price_history"("invoice_date" ASC);

-- CreateIndex
CREATE INDEX "price_history_product_id_invoice_date_idx" ON "public"."price_history"("product_id" ASC, "invoice_date" ASC);

-- CreateIndex
CREATE INDEX "price_history_supplier_id_idx" ON "public"."price_history"("supplier_id" ASC);

-- CreateIndex
CREATE INDEX "products_category_idx" ON "public"."products"("category" ASC);

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "public"."products"("is_active" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "products_venue_id_name_key" ON "public"."products"("venue_id" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "public"."push_subscriptions"("endpoint" ASC);

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions"("user_id" ASC);

-- CreateIndex
CREATE INDEX "recurrences_is_active_idx" ON "public"."recurrences"("is_active" ASC);

-- CreateIndex
CREATE INDEX "recurrences_venue_id_tipo_idx" ON "public"."recurrences"("venue_id" ASC, "tipo" ASC);

-- CreateIndex
CREATE INDEX "recurring_expenses_frequency_idx" ON "public"."recurring_expenses"("frequency" ASC);

-- CreateIndex
CREATE INDEX "recurring_expenses_venue_id_is_active_idx" ON "public"."recurring_expenses"("venue_id" ASC, "is_active" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "register_balances_venue_id_register_type_date_key" ON "public"."register_balances"("venue_id" ASC, "register_type" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "public"."roles"("name" ASC);

-- CreateIndex
CREATE INDEX "schedule_attachments_schedule_id_idx" ON "public"."schedule_attachments"("schedule_id" ASC);

-- CreateIndex
CREATE INDEX "schedule_payments_data_pagamento_idx" ON "public"."schedule_payments"("data_pagamento" ASC);

-- CreateIndex
CREATE INDEX "schedule_payments_schedule_id_idx" ON "public"."schedule_payments"("schedule_id" ASC);

-- CreateIndex
CREATE INDEX "schedule_reconciliations_journal_entry_id_status_idx" ON "public"."schedule_reconciliations"("journal_entry_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_reconciliations_payment_id_key" ON "public"."schedule_reconciliations"("payment_id" ASC);

-- CreateIndex
CREATE INDEX "schedule_reconciliations_schedule_id_status_idx" ON "public"."schedule_reconciliations"("schedule_id" ASC, "status" ASC);

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_schedule_reconciliations_coppia_verificata" ON "public"."schedule_reconciliations"("schedule_id" ASC, "journal_entry_id" ASC) WHERE "status" = 'VERIFIED'::"public"."ScheduleReconciliationStatus";

-- CreateIndex
CREATE INDEX "schedule_reminders_inviato_idx" ON "public"."schedule_reminders"("inviato" ASC);

-- CreateIndex
CREATE INDEX "schedule_reminders_schedule_id_idx" ON "public"."schedule_reminders"("schedule_id" ASC);

-- CreateIndex
CREATE INDEX "schedule_rules_is_active_idx" ON "public"."schedule_rules"("is_active" ASC);

-- CreateIndex
CREATE INDEX "schedule_rules_venue_id_direzione_ordine_idx" ON "public"."schedule_rules"("venue_id" ASC, "direzione" ASC, "ordine" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "schedules_invoice_deadline_id_key" ON "public"."schedules"("invoice_deadline_id" ASC);

-- CreateIndex
CREATE INDEX "schedules_invoice_id_idx" ON "public"."schedules"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "schedules_recurrence_id_idx" ON "public"."schedules"("recurrence_id" ASC);

-- CreateIndex
CREATE INDEX "schedules_stato_idx" ON "public"."schedules"("stato" ASC);

-- CreateIndex
CREATE INDEX "schedules_supplier_id_idx" ON "public"."schedules"("supplier_id" ASC);

-- CreateIndex
CREATE INDEX "schedules_tipo_idx" ON "public"."schedules"("tipo" ASC);

-- CreateIndex
CREATE INDEX "schedules_venue_id_data_attesa_idx" ON "public"."schedules"("venue_id" ASC, "data_attesa" ASC);

-- CreateIndex
CREATE INDEX "schedules_venue_id_data_scadenza_idx" ON "public"."schedules"("venue_id" ASC, "data_scadenza" ASC);

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_schedules_ricorrenza_occorrenza" ON "public"."schedules"("recurrence_id" ASC, "data_scadenza" ASC) WHERE "recurrence_id" IS NOT NULL AND "deleted_at" IS NULL;

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_schedules_ricorrenza_parent_occorrenza" ON "public"."schedules"("ricorrenza_parent_id" ASC, "data_scadenza" ASC) WHERE "ricorrenza_parent_id" IS NOT NULL AND "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "shift_assignments_date_idx" ON "public"."shift_assignments"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_schedule_id_user_id_date_start_time_key" ON "public"."shift_assignments"("schedule_id" ASC, "user_id" ASC, "date" ASC, "start_time" ASC);

-- CreateIndex
CREATE INDEX "shift_assignments_user_id_idx" ON "public"."shift_assignments"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shift_definitions_venue_id_code_key" ON "public"."shift_definitions"("venue_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shift_schedules_venue_id_start_date_end_date_key" ON "public"."shift_schedules"("venue_id" ASC, "start_date" ASC, "end_date" ASC);

-- CreateIndex
CREATE INDEX "supplier_product_accounts_supplier_id_codice_articolo_idx" ON "public"."supplier_product_accounts"("supplier_id" ASC, "codice_articolo" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_accounts_venue_id_supplier_id_nome_normali_key" ON "public"."supplier_product_accounts"("venue_id" ASC, "supplier_id" ASC, "nome_normalizzato" ASC);

-- CreateIndex
CREATE INDEX "suppliers_fiscal_code_hash_idx" ON "public"."suppliers"("fiscal_code_hash" ASC);

-- CreateIndex
-- NOTA: il predicato WHERE di questo indice e' stato riattaccato a mano.
-- Prisma non modella gli indici parziali: l'introspezione ne conserva nome e
-- colonne ma scarta la clausola WHERE, producendo un vincolo piu' stretto di
-- quello reale. Senza il predicato questa baseline reintrodurrebbe i bug
-- documentati in prisma/migrations/post-push/constraints.sql.
CREATE UNIQUE INDEX "ux_suppliers_partita_iva" ON "public"."suppliers"("vat_number" ASC) WHERE "vat_number" IS NOT NULL AND "vat_number" <> '';

-- CreateIndex
CREATE INDEX "timekeeping_policies_venue_id_is_active_idx" ON "public"."timekeeping_policies"("venue_id" ASC, "is_active" ASC);

-- CreateIndex
CREATE INDEX "timekeeping_policy_breaks_policy_id_idx" ON "public"."timekeeping_policy_breaks"("policy_id" ASC);

-- CreateIndex
CREATE INDEX "timekeeping_policy_versions_policy_id_effective_until_idx" ON "public"."timekeeping_policy_versions"("policy_id" ASC, "effective_until" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "public"."users"("reset_token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "venues_code_key" ON "public"."venues"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "work_location_assignments_user_id_work_location_id_key" ON "public"."work_location_assignments"("user_id" ASC, "work_location_id" ASC);

-- CreateIndex
CREATE INDEX "work_location_assignments_work_location_id_ended_at_idx" ON "public"."work_location_assignments"("work_location_id" ASC, "ended_at" ASC);

-- CreateIndex
CREATE INDEX "work_locations_venue_id_is_active_idx" ON "public"."work_locations"("venue_id" ASC, "is_active" ASC);

-- AddForeignKey
ALTER TABLE "public"."account_budget_mappings" ADD CONSTRAINT "account_budget_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_budget_mappings" ADD CONSTRAINT "account_budget_mappings_budget_category_id_fkey" FOREIGN KEY ("budget_category_id") REFERENCES "public"."budget_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_anomalies" ADD CONSTRAINT "attendance_anomalies_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_correction_requests" ADD CONSTRAINT "attendance_correction_requests_anomaly_id_fkey" FOREIGN KEY ("anomaly_id") REFERENCES "public"."attendance_anomalies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_correction_requests" ADD CONSTRAINT "attendance_correction_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_correction_requests" ADD CONSTRAINT "attendance_correction_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_correction_requests" ADD CONSTRAINT "attendance_correction_requests_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_correction_requests" ADD CONSTRAINT "attendance_correction_requests_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_policies" ADD CONSTRAINT "attendance_policies_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_records" ADD CONSTRAINT "attendance_records_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."shift_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_records" ADD CONSTRAINT "attendance_records_correction_request_id_fkey" FOREIGN KEY ("correction_request_id") REFERENCES "public"."attendance_correction_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_records" ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_records" ADD CONSTRAINT "attendance_records_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_records" ADD CONSTRAINT "attendance_records_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bank_accounts" ADD CONSTRAINT "bank_accounts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_matched_entry_id_fkey" FOREIGN KEY ("matched_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_alerts" ADD CONSTRAINT "budget_alerts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_categories" ADD CONSTRAINT "budget_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_categories" ADD CONSTRAINT "budget_categories_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_lines" ADD CONSTRAINT "budget_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_lines" ADD CONSTRAINT "budget_lines_budget_category_id_fkey" FOREIGN KEY ("budget_category_id") REFERENCES "public"."budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budget_targets" ADD CONSTRAINT "budget_targets_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budgets" ADD CONSTRAINT "budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budgets" ADD CONSTRAINT "budgets_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_counts" ADD CONSTRAINT "cash_counts_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."cash_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flow_alerts" ADD CONSTRAINT "cash_flow_alerts_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."cash_flow_forecasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flow_alerts" ADD CONSTRAINT "cash_flow_alerts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flow_forecast_lines" ADD CONSTRAINT "cash_flow_forecast_lines_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."cash_flow_forecasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flow_scenarios" ADD CONSTRAINT "cash_flow_scenarios_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "public"."cash_flow_forecasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flow_settings" ADD CONSTRAINT "cash_flow_settings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_station_templates" ADD CONSTRAINT "cash_station_templates_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_stations" ADD CONSTRAINT "cash_stations_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "public"."daily_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."categorization_rules" ADD CONSTRAINT "categorization_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."categorization_rules" ADD CONSTRAINT "categorization_rules_budget_category_id_fkey" FOREIGN KEY ("budget_category_id") REFERENCES "public"."budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."categorization_rules" ADD CONSTRAINT "categorization_rules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."certifications" ADD CONSTRAINT "certifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clock_reminder_recipients" ADD CONSTRAINT "clock_reminder_recipients_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "public"."clock_reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clock_reminder_recipients" ADD CONSTRAINT "clock_reminder_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clock_reminders" ADD CONSTRAINT "clock_reminders_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communication_reads" ADD CONSTRAINT "communication_reads_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communication_reads" ADD CONSTRAINT "communication_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communications" ADD CONSTRAINT "communications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communications" ADD CONSTRAINT "communications_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_attendance" ADD CONSTRAINT "daily_attendance_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "public"."daily_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_attendance" ADD CONSTRAINT "daily_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_closures" ADD CONSTRAINT "daily_closures_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_closures" ADD CONSTRAINT "daily_closures_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_closures" ADD CONSTRAINT "daily_closures_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_expenses" ADD CONSTRAINT "daily_expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_expenses" ADD CONSTRAINT "daily_expenses_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "public"."daily_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."electronic_invoices" ADD CONSTRAINT "electronic_invoices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."electronic_invoices" ADD CONSTRAINT "electronic_invoices_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."electronic_invoices" ADD CONSTRAINT "electronic_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."electronic_invoices" ADD CONSTRAINT "electronic_invoices_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employee_constraints" ADD CONSTRAINT "employee_constraints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employee_constraints" ADD CONSTRAINT "employee_constraints_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employee_documents" ADD CONSTRAINT "employee_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."hourly_partials" ADD CONSTRAINT "hourly_partials_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "public"."daily_closures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."import_batches" ADD CONSTRAINT "import_batches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."initial_balances" ADD CONSTRAINT "initial_balances_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitation_tokens" ADD CONSTRAINT "invitation_tokens_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitation_tokens" ADD CONSTRAINT "invitation_tokens_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_deadlines" ADD CONSTRAINT "invoice_deadlines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."electronic_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_line_accounts" ADD CONSTRAINT "invoice_line_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_line_accounts" ADD CONSTRAINT "invoice_line_accounts_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_line_accounts" ADD CONSTRAINT "invoice_line_accounts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."electronic_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_applied_rule_id_fkey" FOREIGN KEY ("applied_rule_id") REFERENCES "public"."categorization_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_budget_category_id_fkey" FOREIGN KEY ("budget_category_id") REFERENCES "public"."budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "public"."daily_closures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_counterpart_id_fkey" FOREIGN KEY ("counterpart_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entry_allocations" ADD CONSTRAINT "journal_entry_allocations_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."schedule_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leave_balances" ADD CONSTRAINT "leave_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leave_requests" ADD CONSTRAINT "leave_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_alerts" ADD CONSTRAINT "price_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_alerts" ADD CONSTRAINT "price_alerts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_history" ADD CONSTRAINT "price_history_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurrences" ADD CONSTRAINT "recurrences_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurrences" ADD CONSTRAINT "recurrences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurrences" ADD CONSTRAINT "recurrences_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."register_balances" ADD CONSTRAINT "register_balances_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."relationship_constraint_users" ADD CONSTRAINT "relationship_constraint_users_constraint_id_fkey" FOREIGN KEY ("constraint_id") REFERENCES "public"."relationship_constraints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."relationship_constraint_users" ADD CONSTRAINT "relationship_constraint_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."relationship_constraints" ADD CONSTRAINT "relationship_constraints_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_attachments" ADD CONSTRAINT "schedule_attachments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_attachments" ADD CONSTRAINT "schedule_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_payments" ADD CONSTRAINT "schedule_payments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_reconciliations" ADD CONSTRAINT "schedule_reconciliations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_reconciliations" ADD CONSTRAINT "schedule_reconciliations_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_reconciliations" ADD CONSTRAINT "schedule_reconciliations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."schedule_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_reconciliations" ADD CONSTRAINT "schedule_reconciliations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_reminders" ADD CONSTRAINT "schedule_reminders_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_rules" ADD CONSTRAINT "schedule_rules_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_rules" ADD CONSTRAINT "schedule_rules_conto_id_fkey" FOREIGN KEY ("conto_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_rules" ADD CONSTRAINT "schedule_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_rules" ADD CONSTRAINT "schedule_rules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_invoice_deadline_id_fkey" FOREIGN KEY ("invoice_deadline_id") REFERENCES "public"."invoice_deadlines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."electronic_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_ricorrenza_parent_id_fkey" FOREIGN KEY ("ricorrenza_parent_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shift_assignments" ADD CONSTRAINT "shift_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."shift_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shift_assignments" ADD CONSTRAINT "shift_assignments_shift_definition_id_fkey" FOREIGN KEY ("shift_definition_id") REFERENCES "public"."shift_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shift_assignments" ADD CONSTRAINT "shift_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shift_assignments" ADD CONSTRAINT "shift_assignments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shift_definitions" ADD CONSTRAINT "shift_definitions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shift_schedules" ADD CONSTRAINT "shift_schedules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."supplier_product_accounts" ADD CONSTRAINT "supplier_product_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."supplier_product_accounts" ADD CONSTRAINT "supplier_product_accounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."supplier_product_accounts" ADD CONSTRAINT "supplier_product_accounts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."suppliers" ADD CONSTRAINT "suppliers_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."timekeeping_policies" ADD CONSTRAINT "timekeeping_policies_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."timekeeping_policy_breaks" ADD CONSTRAINT "timekeeping_policy_breaks_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."timekeeping_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."timekeeping_policy_versions" ADD CONSTRAINT "timekeeping_policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."timekeeping_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_timekeeping_policy_id_fkey" FOREIGN KEY ("timekeeping_policy_id") REFERENCES "public"."timekeeping_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."work_location_assignments" ADD CONSTRAINT "work_location_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."work_location_assignments" ADD CONSTRAINT "work_location_assignments_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."work_locations" ADD CONSTRAINT "work_locations_timekeeping_policy_id_fkey" FOREIGN KEY ("timekeeping_policy_id") REFERENCES "public"."timekeeping_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."work_locations" ADD CONSTRAINT "work_locations_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
