-- Phase 2 test users. Run ONLY on the Neon `phase-2` branch, never on production.
-- Idempotent: the unique index on lower(email) makes re-runs a no-op.
INSERT INTO users (id, email, created_at)
VALUES
  (gen_random_uuid(), 'delivered@resend.dev', now()),
  (gen_random_uuid(), 'vamega13@gmail.com', now())
ON CONFLICT (lower(email)) DO NOTHING;
