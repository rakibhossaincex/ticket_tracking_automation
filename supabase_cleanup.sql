-- ============================================================
-- CLEANUP SCRIPT: DROP ALL EXISTING DASHBOARD FUNCTIONS
-- Run this first to clear out overloaded/duplicate functions
-- ============================================================

DO $$ 
DECLARE 
  r RECORD;
BEGIN
  -- Drop all versions of dashboard_aggregates
  FOR r IN (SELECT oid::regprocedure AS proc FROM pg_proc WHERE proname = 'dashboard_aggregates') LOOP
    EXECUTE 'DROP FUNCTION ' || r.proc || ' CASCADE';
  END LOOP;

  -- Drop all versions of dashboard_filter_options
  FOR r IN (SELECT oid::regprocedure AS proc FROM pg_proc WHERE proname = 'dashboard_filter_options') LOOP
    EXECUTE 'DROP FUNCTION ' || r.proc || ' CASCADE';
  END LOOP;

  -- Drop all versions of dashboard_table_page
  FOR r IN (SELECT oid::regprocedure AS proc FROM pg_proc WHERE proname = 'dashboard_table_page') LOOP
    EXECUTE 'DROP FUNCTION ' || r.proc || ' CASCADE';
  END LOOP;
END $$;

-- After running this cleanup script, please re-run the 
-- main `supabase_functions.sql` script immediately after.
