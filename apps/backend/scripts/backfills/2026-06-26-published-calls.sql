-- Create published_calls table
-- Author: bstevens
-- Date:   2026-06-26
--
-- Why: The in-memory PublishedCallRepository loses data on restart.
--      This table persists published Telegram calls so the operator
--      can audit them and track message IDs for debugging.
--
-- Schema:
--   id                 — PK = `${chain}:${address}`
--   chain              — 'solana' | 'ethereum'
--   address            — token address
--   ticker             — extracted symbol (nullable)
--   score              — numerical score
--   tier               — STRONG / DECENT / NEUTRAL / RISKY / SKIP
--   classification     — TOKEN / etc
--   message            — the full sent message text
--   status             — PUBLISHED | FAILED
--   publishedChannelIds — which channels it was sent to
--   failedChannelIds    — which channels failed
--   published_at       — when it was sent
--   mc_at_call         — market cap at time of publish (nullable)
--   telegram_message_id — message_id from Telegram Bot API response (nullable)
--
-- Rollback:
--   DROP TABLE published_calls;

CREATE TABLE IF NOT EXISTS published_calls (
  id VARCHAR PRIMARY KEY,
  chain VARCHAR(32) NOT NULL,
  address VARCHAR NOT NULL,
  ticker VARCHAR(32),
  score INT NOT NULL,
  tier VARCHAR(32) NOT NULL,
  classification VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  published_channel_ids JSONB,
  failed_channel_ids JSONB,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mc_at_call NUMERIC,
  telegram_message_id BIGINT
);

CREATE INDEX IF NOT EXISTS idx_published_calls_status ON published_calls (status);
CREATE INDEX IF NOT EXISTS idx_published_calls_published_at ON published_calls (published_at);