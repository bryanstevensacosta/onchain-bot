-- Backfill: kol-known-lists (DB-backed whitelist)
-- Author: bstevens
-- Date:   2026-06-26
--
-- What: Replaces `DefaultKnownKolRegistry` (hardcoded static map) with
--       a `kol_known_lists` table. Operator can add/remove KOLs from
--       KNOWN_GOOD / KNOWN_BAD without code changes or deploy.
-- Why:  Slice 2 of the kol/reputation plan. The static map was
--       immutable at runtime, so operator adjustments required a PR +
--       deploy cycle. This table makes whitelist/blacklist editable
--       at runtime via the planned admin API.
--
-- Schema:
--   id           — PK
--   kol_id       — Telegram numeric user ID
--   kind         — 'GOOD' | 'BAD'
--   reason       — optional free text ("verified via 3rd-party audit", etc.)
--   evidence_url — optional link to supporting evidence
--   added_by     — operator identifier (admin user, system, etc.)
--   added_at     — when added
--   UNIQUE(kol_id, kind) — a KOL can be GOOD or BAD, but not both at once
--                        (BAD wins via the port's resolution order)
--
-- Verification (after apply):
--   SELECT COUNT(*) FROM kol_known_lists;  -- 0 (fresh install, no rows)
--
-- Migration of existing static entries (if any):
-- The static `DefaultKnownKolRegistry` has these default entries:
--   GOOD: ['1883929251' (BasedDegenGems), '1992057930' (SpyDefi)]
--   BAD:  (empty for now)
-- Seeded below so the leaderboard keeps the same behavior it has today.
--
-- Rollback:
--   DROP TABLE kol_known_lists;

CREATE TABLE IF NOT EXISTS kol_known_lists (
  id BIGSERIAL PRIMARY KEY,
  kol_id VARCHAR(64) NOT NULL,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('GOOD', 'BAD')),
  reason TEXT,
  evidence_url TEXT,
  added_by VARCHAR(100),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kol_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_kol_known_lists_kol_id ON kol_known_lists (kol_id);
CREATE INDEX IF NOT EXISTS idx_kol_known_lists_kind ON kol_known_lists (kind);

INSERT INTO kol_known_lists (kol_id, kind, reason, added_by) VALUES
  ('1883929251', 'GOOD', 'Seeded from DefaultKnownKolRegistry', 'migration'),
  ('1992057930', 'GOOD', 'Seeded from DefaultKnownKolRegistry', 'migration')
ON CONFLICT (kol_id, kind) DO NOTHING;