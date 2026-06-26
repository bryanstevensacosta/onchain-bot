-- Backfill: kol-is-active-sync
-- Author: bstevens
-- Date:   2026-06-26
--
-- What: Sync `kols.is_active` to match `kols.lifecycle_status` for existing rows.
-- Why:  Before commit 56cbf3a, `Kol.activate()` only set `lifecycleStatus=ACTIVE`
--       without flipping `isActive=true`. Result: 7 KOLs have
--       `lifecycle_status='DORMANT'` but `is_active=true` (data inconsistency).
--       The domain mutator fix ensures future transitions stay in sync; this
--       SQL cleans up the pre-existing rows.
--
-- Verification:
--   SELECT COUNT(*) FROM kols
--    WHERE (lifecycle_status='ACTIVE'    AND NOT is_active)
--       OR (lifecycle_status='DORMANT'   AND is_active)
--       OR (lifecycle_status='BLACKLISTED' AND is_active);
--   -- expected: 0
--
-- Rollback:
--   UPDATE kols SET is_active = NOT is_active
--    WHERE lifecycle_status IN ('DORMANT', 'BLACKLISTED');
--   -- (reverses the sync, but does NOT restore pre-backfill state precisely)

UPDATE kols
SET is_active = (lifecycle_status = 'ACTIVE')
WHERE (lifecycle_status = 'ACTIVE'    AND NOT is_active)
   OR (lifecycle_status = 'DORMANT'   AND is_active)
   OR (lifecycle_status = 'BLACKLISTED' AND is_active);