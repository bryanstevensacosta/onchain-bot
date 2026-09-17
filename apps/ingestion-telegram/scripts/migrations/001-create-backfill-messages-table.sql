-- Migration: Create backfill_messages table
-- Date: 2026-09-06
-- Description: Creates the backfill_messages table required by BackfillBufferService
--              to persist broadcast events for 72-hour backfill window during restarts.
--
-- Related files:
--   - apps/ingestion-service/src/stream/infrastructure/persistence/typeorm/backfill-message.entity.ts
--   - apps/ingestion-service/src/stream/infrastructure/backfill-buffer.service.ts
--
-- Run with: psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner -f 001-create-backfill-messages-table.sql

-- Check if table already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'backfill_messages'
  ) THEN
    -- Create the backfill_messages table
    CREATE TABLE backfill_messages (
      event_id VARCHAR(36) PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      channel_id VARCHAR(64) NOT NULL,
      message_id INTEGER NOT NULL,
      payload TEXT NOT NULL
    );

    -- Create index for fast timestamp-based queries during reconnection backfill
    CREATE INDEX idx_backfill_timestamp ON backfill_messages(timestamp);

    RAISE NOTICE 'Table backfill_messages created successfully with index idx_backfill_timestamp';
  ELSE
    RAISE NOTICE 'Table backfill_messages already exists, skipping creation';
  END IF;
END $$;
