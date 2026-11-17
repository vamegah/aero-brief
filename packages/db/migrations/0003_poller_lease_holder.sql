-- Hand-written migration: token-checked poller lease release.
-- Nullable, so the existing lease row (id = 1) stays valid with no holder.
ALTER TABLE "poller_lease" ADD COLUMN "holder" text;
