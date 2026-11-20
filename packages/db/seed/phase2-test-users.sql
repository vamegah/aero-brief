-- Phase 2 test users. Run ONLY on the Neon `phase-2` branch, never on production.
-- Before running, replace <owner-email> (lowercase) with the owner address.
-- Idempotent: the unique index on lower(email) makes re-runs a no-op.
INSERT INTO users (id, email, created_at)
VALUES
  (gen_random_uuid(), 'delivered@resend.dev', now()),
  (gen_random_uuid(), '<owner-email>', now())
ON CONFLICT (lower(email)) DO NOTHING;
