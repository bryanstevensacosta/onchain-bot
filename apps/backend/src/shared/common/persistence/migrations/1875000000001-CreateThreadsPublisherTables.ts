import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the 8 Threads publisher tables (clone+rename of the
 * crypto-news-publisher tables, WITHOUT any media table).
 *
 * Tables (creation order = queue → keywords → blacklist → llm →
 * templates → throttle → matching → oauth; down() drops in exact
 * reverse order):
 *   1. threads_queue_entries
 *   2. threads_keywords
 *   3. threads_blacklist_phrases
 *   4. threads_llm_configs (NO target_channel, NO matching_enabled —
 *      matching lives in threads_matching_configs from day one)
 *   5. threads_prompt_templates
 *   6. threads_throttle_states
 *   7. threads_matching_configs
 *   8. threads_oauth_tokens
 *
 * All statements are IF NOT EXISTS / IF EXISTS so the migration is
 * safe to re-run and coexists with synchronize-era dev DBs. No
 * seeds, no secrets, no tokens in this migration.
 */
export class CreateThreadsPublisherTables1875000000001
  implements MigrationInterface
{
  public name = 'CreateThreadsPublisherTables1875000000001';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `CREATE TABLE IF NOT EXISTS threads_queue_entries (` +
        `id uuid PRIMARY KEY, ` +
        `trace_id uuid NULL, ` +
        `channel_id varchar(64) NOT NULL, ` +
        `message_id integer NOT NULL, ` +
        `raw_content text NOT NULL, ` +
        `raw_title varchar(512) NULL, ` +
        `image_path text NULL, ` +
        `image_paths text[] NULL DEFAULT '{}', ` +
        `grouped_id varchar(64) NULL, ` +
        `message_received_at timestamptz NOT NULL, ` +
        `queued_at timestamptz NOT NULL DEFAULT now(), ` +
        `matched_keyword_ids text[] NULL DEFAULT '{}', ` +
        `keyword_template_id uuid NULL, ` +
        `formatting_entities text NULL, ` +
        `status varchar(16) NOT NULL, ` +
        `published_at timestamptz NULL, ` +
        `telegram_message_id varchar NULL, ` +
        `last_error text NULL, ` +
        `attempts integer NOT NULL DEFAULT 0, ` +
        `generated_content text NULL, ` +
        `generated_system_prompt text NULL, ` +
        `generated_user_prompt text NULL, ` +
        `generated_temperature real NULL, ` +
        `generated_reasoning_effort varchar(16) NULL, ` +
        `generated_model varchar(255) NULL, ` +
        `blocked_reason text NULL, ` +
        `duplicate_of_channel_id varchar(64) NULL, ` +
        `duplicate_of_message_id integer NULL, ` +
        `duplicate_of_entry_id uuid NULL` +
        `)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_threads_queue_message_received_at ON threads_queue_entries (message_received_at)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_threads_queue_status ON threads_queue_entries (status)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_threads_queue_keyword_template_id ON threads_queue_entries (keyword_template_id)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_threads_queue_pending ON threads_queue_entries (queued_at) WHERE status = 'PENDING'`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_threads_queue_channel_message ON threads_queue_entries (channel_id, message_id)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS threads_keywords (` +
        `id uuid PRIMARY KEY, ` +
        `phrase varchar(200) NOT NULL, ` +
        `case_sensitive boolean NOT NULL DEFAULT false, ` +
        `source_channel_ids text[] NULL DEFAULT '{}', ` +
        `template_id uuid NULL, ` +
        `enabled boolean NOT NULL DEFAULT true, ` +
        `and_group_id uuid NULL, ` +
        `require_image boolean NOT NULL DEFAULT false, ` +
        `match_mode varchar(16) NOT NULL DEFAULT 'substring', ` +
        `created_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_threads_keywords_enabled ON threads_keywords (enabled)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_threads_keywords_template_id ON threads_keywords (template_id)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS threads_blacklist_phrases (` +
        `id uuid PRIMARY KEY, ` +
        `phrase varchar(200) NOT NULL, ` +
        `case_sensitive boolean NOT NULL DEFAULT false, ` +
        `match_mode varchar(20) NOT NULL DEFAULT 'substring', ` +
        `source_channel_ids text[] NULL DEFAULT '{}', ` +
        `and_group_id uuid NULL, ` +
        `require_image boolean NOT NULL DEFAULT false, ` +
        `enabled boolean NOT NULL DEFAULT true, ` +
        `created_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_threads_blacklist_phrases_enabled ON threads_blacklist_phrases (enabled)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS threads_llm_configs (` +
        `id integer PRIMARY KEY, ` +
        `default_template_id uuid NOT NULL, ` +
        `llm_enabled boolean NOT NULL DEFAULT false, ` +
        `publishing_enabled boolean NOT NULL DEFAULT false, ` +
        `reject_non_latin boolean NOT NULL DEFAULT true, ` +
        `daily_cap integer NOT NULL, ` +
        `daily_reset_utc_hour integer NOT NULL, ` +
        `random_delay_min_ms integer NOT NULL, ` +
        `random_delay_max_ms integer NOT NULL, ` +
        `llm_max_attempts integer NOT NULL, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS threads_prompt_templates (` +
        `id uuid PRIMARY KEY, ` +
        `name varchar(100) NOT NULL, ` +
        `description text NULL, ` +
        `model varchar(200) NOT NULL, ` +
        `supports_vision boolean NOT NULL DEFAULT true, ` +
        `max_tokens integer NOT NULL, ` +
        `temperature double precision NOT NULL, ` +
        `reasoning_effort varchar(16) NULL, ` +
        `prompt_text text NOT NULL, ` +
        `system_prompt_text text NULL, ` +
        `created_at timestamptz NOT NULL DEFAULT now(), ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_threads_prompt_templates_name ON threads_prompt_templates (name)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS threads_throttle_states (` +
        `id integer PRIMARY KEY, ` +
        `last_publish_at timestamptz NULL, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS "threads_matching_configs" ("id" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_threads_matching_configs" PRIMARY KEY ("id"))`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS threads_oauth_tokens (` +
        `id integer PRIMARY KEY, ` +
        `access_token text NOT NULL, ` +
        `threads_user_id varchar(64) NOT NULL, ` +
        `obtained_at timestamptz NOT NULL DEFAULT now(), ` +
        `expires_in_s integer NOT NULL, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS threads_oauth_tokens`);
    await qr.query(`DROP TABLE IF EXISTS "threads_matching_configs"`);
    await qr.query(`DROP TABLE IF EXISTS threads_throttle_states`);
    await qr.query(`DROP TABLE IF EXISTS threads_prompt_templates`);
    await qr.query(`DROP TABLE IF EXISTS threads_llm_configs`);
    await qr.query(`DROP TABLE IF EXISTS threads_blacklist_phrases`);
    await qr.query(`DROP TABLE IF EXISTS threads_keywords`);
    await qr.query(`DROP TABLE IF EXISTS threads_queue_entries`);
  }
}
