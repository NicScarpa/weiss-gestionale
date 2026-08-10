-- =============================================================================
-- Row Level Security su TUTTE le tabelle dello schema public
-- Sistema Gestionale Weiss Cafè
-- =============================================================================
-- Che cosa fa, per ogni tabella trovata in pg_tables:
--   1. ENABLE + FORCE ROW LEVEL SECURITY
--   2. una policy "service_role_all" che dà accesso pieno al solo service_role
--   3. di conseguenza: l'API PostgREST (anon / authenticated) non vede nulla
--
-- NON c'è una lista di nomi. L'elenco si legge dal catalogo a ogni esecuzione:
-- una tabella nuova è protetta senza che nessuno debba ricordarsi di aggiungerla.
-- Questo è il punto: le due liste scritte a mano che questo file aveva prima
-- (57 nomi qui, 47 in scripts/enable-rls.mjs) divergevano dallo schema e fra loro.
--
-- Idempotente: rieseguirlo su un database già protetto non cambia nulla.
--
-- Applicazione:
--   psql "$DATABASE_URL" -f prisma/sql/enable_rls_all_tables.sql
--   nvm use 22 && node --env-file=.env scripts/enable-rls.mjs   (esegue questo file)
-- =============================================================================

\set ON_ERROR_STOP on

-- ALTER TABLE prende un lock ACCESS EXCLUSIVE. Se una transazione lunga tiene
-- la tabella, l'ALTER si mette in coda — e dietro di lui si accoda TUTTO il
-- traffico su quella tabella: l'applicazione si ferma. Con un lock_timeout la
-- singola tabella fallisce, viene riportata come FALLITA e la si recupera
-- rieseguendo il file (è idempotente). Meglio una tabella scoperta per cinque
-- minuti che la produzione bloccata.
SET lock_timeout = '5s';

DO $$
DECLARE
    -- ATTENZIONE: NON chiamare questa variabile "table_name" né "tablename".
    -- Una variabile PL/pgSQL omonima di una colonna referenziata nel corpo rende
    -- il riferimento ambiguo: SQLSTATE 42702, e siccome il blocco DO è atomico
    -- muore l'intero script. È il motivo per cui questo file non ha mai
    -- abilitato una sola RLS pur stampando "RLS abilitato" a ogni giro.
    v_tabella          TEXT;
    v_service_role     BOOLEAN;
    v_bypassa          BOOLEAN;
    v_ok               INT := 0;
    v_errori           INT := 0;
    v_totali           INT := 0;
BEGIN
    -- -------------------------------------------------------------------------
    -- Guardia anti-autoesclusione.
    -- FORCE ROW LEVEL SECURITY applica le policy ANCHE al proprietario della
    -- tabella. Se chi esegue non bypassa RLS, dopo questo script si trova fuori
    -- dai propri dati: SELECT a zero righe e INSERT rifiutate, senza errori
    -- evidenti. In produzione l'applicazione si connette come "postgres", che ha
    -- BYPASSRLS, e non se ne accorge; un ambiente ricostruito può non averlo.
    -- -------------------------------------------------------------------------
    SELECT rolsuper OR rolbypassrls INTO v_bypassa
    FROM pg_roles WHERE rolname = current_user;

    IF NOT COALESCE(v_bypassa, false)
       AND COALESCE(current_setting('rls.consento_lockout', true), '') <> 'on' THEN
        RAISE EXCEPTION
            'Il ruolo "%" non ha BYPASSRLS né è superuser: con FORCE RLS resterebbe chiuso fuori dalle sue tabelle.',
            current_user
        USING HINT = 'Esegui come un ruolo con BYPASSRLS (su Supabase: postgres), oppure — se sai cosa fai — SET rls.consento_lockout = ''on''; prima di questo file.';
    END IF;

    -- Su un PostgreSQL che non è Supabase il ruolo service_role non esiste e la
    -- CREATE POLICY fallirebbe. In quel caso si abilita comunque la RLS: senza
    -- policy la tabella nega tutto a chiunque non bypassi, che è il default sicuro.
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
    INTO v_service_role;

    IF NOT v_service_role THEN
        RAISE WARNING 'Ruolo "service_role" assente: abilito RLS senza creare policy (default: nega tutto).';
    END IF;

    -- -------------------------------------------------------------------------
    -- Il ciclo. Sorgente: pg_tables, non una lista.
    -- Escluse le sole tabelle appartenenti a un'estensione: non ne siamo
    -- proprietari, l'ALTER fallirebbe.
    -- -------------------------------------------------------------------------
    FOR v_tabella IN
        SELECT t.tablename
        FROM pg_tables t
        WHERE t.schemaname = 'public'
          AND NOT EXISTS (
              SELECT 1
              FROM pg_depend d
              JOIN pg_class c     ON c.oid = d.objid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE d.deptype = 'e'
                AND n.nspname = t.schemaname
                AND c.relname = t.tablename
          )
        ORDER BY t.tablename
    LOOP
        v_totali := v_totali + 1;

        -- Un blocco con EXCEPTION per tabella: un fallimento isolato non abbatte
        -- l'intera esecuzione, e soprattutto non si stampa successo prima di averlo.
        BEGIN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabella);
            EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', v_tabella);

            EXECUTE format('DROP POLICY IF EXISTS "service_role_all"   ON public.%I', v_tabella);
            EXECUTE format('DROP POLICY IF EXISTS "deny_anon"          ON public.%I', v_tabella);
            EXECUTE format('DROP POLICY IF EXISTS "deny_authenticated" ON public.%I', v_tabella);

            IF v_service_role THEN
                EXECUTE format($f$
                    CREATE POLICY "service_role_all" ON public.%I
                    FOR ALL
                    TO service_role
                    USING (true)
                    WITH CHECK (true)
                $f$, v_tabella);
            END IF;

            v_ok := v_ok + 1;
            RAISE NOTICE 'RLS attiva: %', v_tabella;
        EXCEPTION WHEN OTHERS THEN
            v_errori := v_errori + 1;
            RAISE WARNING 'FALLITA %: % (SQLSTATE %)', v_tabella, SQLERRM, SQLSTATE;
        END;
    END LOOP;

    RAISE NOTICE '--------------------------------------------------';
    RAISE NOTICE 'Tabelle esaminate: %  ·  protette: %  ·  fallite: %', v_totali, v_ok, v_errori;

    IF v_errori > 0 THEN
        RAISE WARNING 'Restano % tabelle non protette: vedi le righe FALLITA qui sopra e la verifica finale.', v_errori;
    END IF;
END $$;

-- =============================================================================
-- Verifica finale — è questa che dice la verità, non i NOTICE.
-- Elenca SOLO ciò che è rimasto difettoso: RLS spenta, FORCE mancante, o
-- nessuna policy. Zero righe = tutto lo schema public è protetto.
-- La policy mancante conta come difetto solo dove service_role esiste: senza
-- (PostgreSQL non Supabase) l'assenza di policy è lo stato voluto, non un buco.
-- =============================================================================
SELECT c.relname                                                     AS tabella,
       c.relrowsecurity                                              AS rls_attiva,
       c.relforcerowsecurity                                         AS force_attivo,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)   AS policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND (
        NOT c.relrowsecurity
     OR NOT c.relforcerowsecurity
     OR (    EXISTS (SELECT 1 FROM pg_roles  r WHERE r.rolname  = 'service_role')
         AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
  )
ORDER BY c.relname;
