-- Custom SQL migration file, put your code below! --
-- Kargo fork patch: pg_search (ParadeDB) is not available on Neon
-- (deprecated/blocked extension). Try to enable it, but skip gracefully
-- when the host refuses so the rest of the migration chain can proceed.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_search;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_search extension unavailable on this host, skipping (in-app full-text search disabled)';
  END;
END
$$;
