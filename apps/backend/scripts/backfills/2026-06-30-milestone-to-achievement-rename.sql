-- Backfill: milestone-to-achievement-rename
-- Author: bstevens
-- Date:   2026-06-30
--
-- What: Rename 3 tables to align with the milestone→achievement refactor
--       (commit fb3eea2 → bca04d5) and add telegram_message_id column to
--       the renamed notified_milestones table.
-- Why:  The backend BCs were renamed (token/milestone → token/achievement,
--       token/token-gating → token/vip-call-approval). The DB tables
--       must follow the domain language. The notify_achievements table
--       also needs a new column to persist the Telegram message_id of
--       each published achievement alert.
--
-- Tables affected:
--   milestone_thresholds     → achievement_thresholds (99 rows preserved)
--   notified_milestones      → notified_achievements (0 rows; new col added)
--   filter_decisions         → vip_call_approval_decisions (1 row preserved)
--
-- Indexes, sequences, and FKs auto-rename with the table in Postgres.
--
-- Verification:
--   \d+ achievement_thresholds
--   \d+ notified_achievements
--   \d+ vip_call_approval_decisions
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'notified_achievements' AND column_name = 'telegram_message_id';
--   -- expected: telegram_message_id
--
-- Rollback:
--   BEGIN;
--   ALTER TABLE IF EXISTS notified_achievements DROP COLUMN IF EXISTS telegram_message_id;
--   ALTER TABLE IF EXISTS achievement_thresholds RENAME TO milestone_thresholds;
--   ALTER TABLE IF EXISTS notified_achievements RENAME TO notified_milestones;
--   ALTER TABLE IF EXISTS vip_call_approval_decisions RENAME TO filter_decisions;
--   COMMIT;

BEGIN;

ALTER TABLE IF EXISTS milestone_thresholds RENAME TO achievement_thresholds;

ALTER TABLE IF EXISTS notified_milestones RENAME TO notified_achievements;

ALTER TABLE IF EXISTS filter_decisions RENAME TO vip_call_approval_decisions;

ALTER TABLE notified_achievements ADD COLUMN IF NOT EXISTS telegram_message_id bigint NULL;

COMMIT;