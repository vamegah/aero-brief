-- Manual step, run in Neon on the phase-2 branch after migration 0005:
--   psql "$PHASE2_DATABASE_URL" -v runtime_role=<your_runtime_role> -f 0005_digest.grants.sql
GRANT SELECT, INSERT, UPDATE, DELETE ON "digest_preferences", "digest_deliveries" TO :runtime_role;
