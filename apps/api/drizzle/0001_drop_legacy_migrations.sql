-- The first M0 bootstrap used a custom migration runner.
-- Drizzle now owns the migration history, so the old ledger is no longer needed.
DROP TABLE IF EXISTS "schema_migrations";
