-- Phase 2 digest local-run seed (task 5.22). Run ONLY on the Neon `phase-2` branch (br-odd-feather-bbpy60hl).
-- NEVER run on production (br-delicate-bar-bbqk6hwk).
-- Replace :hour with the current UTC hour (0-23) before running; the Neon console does not substitute variables.
-- Also replace <owner-email> (lowercase) with the allowlisted owner address before running.
-- The digest is due from that UTC hour until the end of the 3rd hour after it (a 4-hour window).
-- Idempotent: safe to run again, for example to move the hour. delivered@resend.dev gets no preference on purpose.

INSERT INTO users (email) VALUES ('digest-skip-test@example.invalid') ON CONFLICT DO NOTHING;

INSERT INTO subscriptions (user_id, airport_id)
SELECT id, 'ATL' FROM users
WHERE lower(email) IN ('<owner-email>', 'digest-skip-test@example.invalid')
ON CONFLICT DO NOTHING;

-- updated_at one day back, so the "updated after the scheduled instant" rule does not drop the user.
INSERT INTO digest_preferences (user_id, enabled, hour, updated_at)
SELECT id, true, :hour, now() - interval '1 day' FROM users
WHERE lower(email) IN ('<owner-email>', 'digest-skip-test@example.invalid')
ON CONFLICT (user_id) DO UPDATE
  SET enabled = true, hour = EXCLUDED.hour, updated_at = now() - interval '1 day';

-- ---------------------------------------------------------------------------------------------
-- CLEANUP (run separately, phase-2 branch only). Lets a second test day run.
-- DELETE FROM digest_deliveries WHERE user_id IN (SELECT id FROM users WHERE lower(email) IN ('<owner-email>', 'digest-skip-test@example.invalid'));
-- DELETE FROM digest_preferences WHERE user_id IN (SELECT id FROM users WHERE lower(email) IN ('<owner-email>', 'digest-skip-test@example.invalid'));
-- DELETE FROM subscriptions WHERE airport_id = 'ATL' AND user_id IN (SELECT id FROM users WHERE lower(email) IN ('<owner-email>', 'digest-skip-test@example.invalid'));
-- DELETE FROM users WHERE lower(email) = 'digest-skip-test@example.invalid';
