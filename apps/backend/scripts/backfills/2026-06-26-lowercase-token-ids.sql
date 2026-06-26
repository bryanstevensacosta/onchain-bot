-- Backfill: lowercase-token-ids + dedup + CHECK constraints
-- Author: bstevens
-- Date:   2026-06-26
--
-- What: Three-step normalization for token-related IDs across the 4 tables:
--       1. Delete duplicate rows where id differs only by case (keep the lowercase)
--       2. Lowercase all remaining mixed-case ids
--       3. Re-apply CHECK constraints so the invariant is enforced
-- Why:  17 of 24 canonical_token_calls had mixed-case ids (e.g.
--       `solana:FVf2FrtJSAorAfFhYDbGg5UrMksDDJEzus9npV3gpump`). The
--       endpoint code constructs lookup IDs as `${chain}:${address.toLowerCase()}`
--       (e.g. typeorm-token-score.repository.ts:37), so these rows returned
--       404 NOT_FOUND despite existing in the DB.
--
--       Root cause was in the domain layer: NormalizedAddress.fromSolana()
--       stored the raw mixed-case value (unlike fromEvm which lowercased).
--       Commit (in this PR) fixes fromSolana() to lowercase. The migration
--       here cleans existing rows + re-enforces the CHECK constraint.
--
-- Defense-in-depth layers:
--   Domain:  NormalizedAddress.fromSolana() now lowercases
--   ORM:     TypeORM @BeforeInsert/@BeforeUpdate hooks auto-lowercase id
--   DB:      CHECK (id = lower(id)) — re-applied here, may need re-apply
--            if TypeORM synchronize: true drops it. Idempotent DROP+ADD
--            pattern in step 3 makes `db:migrate` always restore it.
--
-- Verification (after apply):
--   SELECT COUNT(*) FROM token_scores WHERE id != lower(id);  -- 0
--   SELECT COUNT(*) FROM token_scores;                          -- 26 (was 27)
--   curl http://localhost:3030/token/scoring/tokens/solana/FVf2Fr...   -- 200 OK
--   INSERT mixed-case → fails with check_violation
--
-- Rollback (drops the CHECK constraints):
--   ALTER TABLE token_scores          DROP CONSTRAINT IF EXISTS chk_id_lowercase;
--   ALTER TABLE token_snapshots        DROP CONSTRAINT IF EXISTS chk_id_lowercase;
--   ALTER TABLE canonical_token_calls  DROP CONSTRAINT IF EXISTS chk_id_lowercase;
--   ALTER TABLE filter_decisions       DROP CONSTRAINT IF EXISTS chk_id_lowercase;

DELETE FROM token_scores
WHERE id != lower(id)
  AND lower(id) IN (SELECT id FROM token_scores);

DELETE FROM token_snapshots
WHERE id != lower(id)
  AND lower(id) IN (SELECT id FROM token_snapshots);

DELETE FROM canonical_token_calls
WHERE id != lower(id)
  AND lower(id) IN (SELECT id FROM canonical_token_calls);

DELETE FROM filter_decisions
WHERE id != lower(id)
  AND lower(id) IN (SELECT id FROM filter_decisions);

UPDATE token_scores          SET id = lower(id) WHERE id != lower(id);
UPDATE token_snapshots        SET id = lower(id) WHERE id != lower(id);
UPDATE canonical_token_calls  SET id = lower(id) WHERE id != lower(id);
UPDATE filter_decisions       SET id = lower(id) WHERE id != lower(id);

ALTER TABLE token_scores          DROP CONSTRAINT IF EXISTS chk_id_lowercase;
ALTER TABLE token_snapshots        DROP CONSTRAINT IF EXISTS chk_id_lowercase;
ALTER TABLE canonical_token_calls  DROP CONSTRAINT IF EXISTS chk_id_lowercase;
ALTER TABLE filter_decisions       DROP CONSTRAINT IF EXISTS chk_id_lowercase;

ALTER TABLE token_scores          ADD CONSTRAINT chk_id_lowercase CHECK (id = lower(id));
ALTER TABLE token_snapshots        ADD CONSTRAINT chk_id_lowercase CHECK (id = lower(id));
ALTER TABLE canonical_token_calls  ADD CONSTRAINT chk_id_lowercase CHECK (id = lower(id));
ALTER TABLE filter_decisions       ADD CONSTRAINT chk_id_lowercase CHECK (id = lower(id));