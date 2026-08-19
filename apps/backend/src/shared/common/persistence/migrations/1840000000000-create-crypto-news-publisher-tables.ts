import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCryptoNewsPublisherTables1840000000000 implements MigrationInterface {
  public name = 'CreateCryptoNewsPublisherTables1840000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `CREATE TABLE IF NOT EXISTS blacklist_phrases (` +
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
      `CREATE INDEX IF NOT EXISTS idx_blacklist_phrases_enabled ON blacklist_phrases (enabled)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_publisher_keywords (` +
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
      `CREATE INDEX IF NOT EXISTS idx_crypto_news_publisher_keywords_enabled ON crypto_news_publisher_keywords (enabled)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_crypto_news_publisher_keywords_template_id ON crypto_news_publisher_keywords (template_id)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_publisher_llm_config (` +
        `id integer PRIMARY KEY, ` +
        `default_template_id uuid NOT NULL, ` +
        `target_channel varchar(64) NOT NULL DEFAULT '', ` +
        `enabled boolean NOT NULL DEFAULT false, ` +
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
      `CREATE TABLE IF NOT EXISTS crypto_news_publisher_prompt_templates (` +
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
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_news_publisher_prompt_templates_name ON crypto_news_publisher_prompt_templates (name)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_publisher_queue (` +
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
        `matched_keyword_ids text[] NULL DEFAULT '{}', ` +
        `keyword_template_id uuid NULL, ` +
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
      `CREATE INDEX IF NOT EXISTS idx_publisher_queue_message_received_at ON crypto_news_publisher_queue (message_received_at)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_publisher_queue_status ON crypto_news_publisher_queue (status)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_publisher_queue_keyword_template_id ON crypto_news_publisher_queue (keyword_template_id)`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_publisher_queue_channel_message ON crypto_news_publisher_queue (channel_id, message_id)`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_publisher_throttle_state (` +
        `id integer PRIMARY KEY, ` +
        `last_publish_at timestamptz NULL, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS crypto_news_publisher_throttle_state`);
    await qr.query(`DROP TABLE IF EXISTS crypto_news_publisher_queue`);
    await qr.query(
      `DROP TABLE IF EXISTS crypto_news_publisher_prompt_templates`,
    );
    await qr.query(`DROP TABLE IF EXISTS crypto_news_publisher_llm_config`);
    await qr.query(`DROP TABLE IF EXISTS crypto_news_publisher_keywords`);
    await qr.query(`DROP TABLE IF EXISTS blacklist_phrases`);
  }
}
