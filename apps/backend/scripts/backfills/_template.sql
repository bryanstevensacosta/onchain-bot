-- Backfill: <short-name>
-- Author: <github-handle>
-- Date:   YYYY-MM-DD
--
-- What: <one-line description of what this fixes>
-- Why:  <link to PR/issue or context>
--
-- Verification:
--   SELECT COUNT(*) FROM <table> WHERE <condition-that-was-broken>;
--   -- expected: 0
--
-- Rollback:
--   <SQL to undo the change, if reversible. Else: 'NOT REVERSIBLE — restore from backup.'>

UPDATE <table> AS t
SET <column> = <new_value>
FROM <other-table> AS o
WHERE t.<join-key> = o.<join-key>
  AND <condition-that-defines-rows-needing-backfill>
  -- AND <safety-condition-if-not-already-applied>;