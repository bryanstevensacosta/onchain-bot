import type { QueryRunner } from 'typeorm';
import { CreateCryptoNewsPublisherTables1840000000000 } from '../1840000000000-create-crypto-news-publisher-tables';

describe('CreateCryptoNewsPublisherTables1840000000000 migration', () => {
  const migration = new CreateCryptoNewsPublisherTables1840000000000();

  function createQueryRunner(): {
    runner: QueryRunner;
    query: jest.Mock;
  } {
    const query = jest.fn();
    return { runner: { query } as unknown as QueryRunner, query };
  }

  it('up() creates the 6 BC tables with column-exact assertions', async () => {
    const { runner, query } = createQueryRunner();

    await migration.up(runner);

    const ddls = query.mock.calls.map((c) => String(c[0]));

    // 6 CREATE TABLE statements
    const createTableDdls = ddls.filter((d) =>
      d.startsWith('CREATE TABLE IF NOT EXISTS'),
    );
    expect(createTableDdls).toHaveLength(6);

    // 8 indexes total (6 regular + 2 unique)
    const regularIndexDdls = ddls.filter((d) =>
      d.startsWith('CREATE INDEX IF NOT EXISTS'),
    );
    const uniqueIndexDdls = ddls.filter((d) =>
      d.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS'),
    );
    expect(regularIndexDdls).toHaveLength(6);
    expect(uniqueIndexDdls).toHaveLength(2);
    expect(regularIndexDdls.length + uniqueIndexDdls.length).toBe(8);

    // --- blacklist_phrases ---
    const blacklist = createTableDdls.find((d) =>
      d.includes('blacklist_phrases ('),
    )!;
    expect(blacklist).toContain('id uuid PRIMARY KEY');
    expect(blacklist).not.toMatch(
      /id uuid PRIMARY KEY DEFAULT gen_random_uuid/,
    );
    expect(blacklist).toContain('phrase varchar(200) NOT NULL');
    expect(blacklist).toContain(
      'case_sensitive boolean NOT NULL DEFAULT false',
    );
    expect(blacklist).toContain(
      "match_mode varchar(20) NOT NULL DEFAULT 'substring'",
    );
    expect(blacklist).toContain("source_channel_ids text[] NULL DEFAULT '{}'");
    expect(blacklist).toContain('and_group_id uuid NULL');
    expect(blacklist).toContain('require_image boolean NOT NULL DEFAULT false');
    expect(blacklist).toContain('enabled boolean NOT NULL DEFAULT true');
    expect(blacklist).toContain(
      'created_at timestamptz NOT NULL DEFAULT now()',
    );
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE INDEX IF NOT EXISTS') &&
          d.includes('idx_blacklist_phrases_enabled') &&
          d.includes('blacklist_phrases (enabled)'),
      ),
    ).toBe(true);

    // --- crypto_news_publisher_keywords ---
    const keywords = createTableDdls.find((d) =>
      d.includes('crypto_news_publisher_keywords ('),
    )!;
    expect(keywords).toContain('id uuid PRIMARY KEY');
    expect(keywords).not.toMatch(/id uuid PRIMARY KEY DEFAULT gen_random_uuid/);
    expect(keywords).toContain('phrase varchar(200) NOT NULL');
    expect(keywords).toContain("source_channel_ids text[] NULL DEFAULT '{}'");
    expect(keywords).toContain('template_id uuid NULL');
    expect(keywords).toContain(
      "match_mode varchar(16) NOT NULL DEFAULT 'substring'",
    );
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE INDEX IF NOT EXISTS') &&
          d.includes('idx_crypto_news_publisher_keywords_enabled'),
      ),
    ).toBe(true);
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE INDEX IF NOT EXISTS') &&
          d.includes('idx_crypto_news_publisher_keywords_template_id') &&
          d.includes('crypto_news_publisher_keywords (template_id)'),
      ),
    ).toBe(true);

    // --- crypto_news_publisher_llm_config ---
    const llmConfig = createTableDdls.find((d) =>
      d.includes('crypto_news_publisher_llm_config ('),
    )!;
    expect(llmConfig).toContain('id integer PRIMARY KEY');
    expect(llmConfig).not.toMatch(/id integer PRIMARY KEY.*SERIAL/);
    expect(llmConfig).toContain('default_template_id uuid NOT NULL');
    expect(llmConfig).toContain(
      "target_channel varchar(64) NOT NULL DEFAULT ''",
    );
    expect(llmConfig).toContain('enabled boolean NOT NULL DEFAULT false');
    expect(llmConfig).toContain(
      'reject_non_latin boolean NOT NULL DEFAULT true',
    );
    expect(llmConfig).toContain('daily_cap integer NOT NULL');
    expect(llmConfig).toContain('llm_max_attempts integer NOT NULL');
    expect(llmConfig).toContain(
      'updated_at timestamptz NOT NULL DEFAULT now()',
    );

    // --- crypto_news_publisher_prompt_templates ---
    const promptTemplates = createTableDdls.find((d) =>
      d.includes('crypto_news_publisher_prompt_templates ('),
    )!;
    expect(promptTemplates).toContain('id uuid PRIMARY KEY');
    expect(promptTemplates).not.toMatch(
      /id uuid PRIMARY KEY DEFAULT gen_random_uuid/,
    );
    expect(promptTemplates).toContain('name varchar(100) NOT NULL');
    expect(promptTemplates).toContain('description text NULL');
    expect(promptTemplates).toContain('model varchar(200) NOT NULL');
    expect(promptTemplates).toContain('temperature double precision NOT NULL');
    expect(promptTemplates).toContain('reasoning_effort varchar(16) NULL');
    expect(promptTemplates).toContain('prompt_text text NOT NULL');
    expect(promptTemplates).toContain('system_prompt_text text NULL');
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS') &&
          d.includes('uq_crypto_news_publisher_prompt_templates_name') &&
          d.includes('crypto_news_publisher_prompt_templates (name)'),
      ),
    ).toBe(true);

    // --- crypto_news_publisher_queue ---
    const queue = createTableDdls.find((d) =>
      d.includes('crypto_news_publisher_queue ('),
    )!;
    expect(queue).toContain('id uuid PRIMARY KEY');
    expect(queue).not.toMatch(/id uuid PRIMARY KEY DEFAULT gen_random_uuid/);
    expect(queue).toContain('channel_id varchar(64) NOT NULL');
    expect(queue).toContain('message_id integer NOT NULL');
    expect(queue).toContain('raw_content text NOT NULL');
    expect(queue).toContain('image_path text NULL');
    expect(queue).toContain("image_paths text[] NULL DEFAULT '{}'");
    expect(queue).toContain('message_received_at timestamptz NOT NULL');
    expect(queue).toContain("matched_keyword_ids text[] NULL DEFAULT '{}'");
    expect(queue).toContain('status varchar(16) NOT NULL');
    expect(queue).toContain('attempts integer NOT NULL DEFAULT 0');
    expect(queue).toContain('generated_temperature real NULL');
    expect(queue).toContain('duplicate_of_entry_id uuid NULL');
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE INDEX IF NOT EXISTS') &&
          d.includes('idx_publisher_queue_message_received_at') &&
          d.includes('crypto_news_publisher_queue (message_received_at)'),
      ),
    ).toBe(true);
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE INDEX IF NOT EXISTS') &&
          d.includes('idx_publisher_queue_status') &&
          d.includes('crypto_news_publisher_queue (status)'),
      ),
    ).toBe(true);
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE INDEX IF NOT EXISTS') &&
          d.includes('idx_publisher_queue_keyword_template_id') &&
          d.includes('crypto_news_publisher_queue (keyword_template_id)'),
      ),
    ).toBe(true);
    expect(
      ddls.some(
        (d) =>
          d.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS') &&
          d.includes('uq_publisher_queue_channel_message') &&
          d.includes('crypto_news_publisher_queue (channel_id, message_id)'),
      ),
    ).toBe(true);

    // --- crypto_news_publisher_throttle_state ---
    const throttle = createTableDdls.find((d) =>
      d.includes('crypto_news_publisher_throttle_state ('),
    )!;
    expect(throttle).toContain('id integer PRIMARY KEY');
    expect(throttle).not.toMatch(/id integer PRIMARY KEY.*SERIAL/);
    expect(throttle).toContain('last_publish_at timestamptz NULL');
    expect(throttle).toContain('updated_at timestamptz NOT NULL DEFAULT now()');
  });

  it('down() drops all 6 tables in reverse order', async () => {
    const { runner, query } = createQueryRunner();

    await migration.down(runner);

    expect(query).toHaveBeenCalledTimes(6);
    const ddls = query.mock.calls.map((c) => String(c[0]));
    ddls.forEach((d) => expect(d).toContain('DROP TABLE IF EXISTS'));

    expect(ddls[0]).toContain('crypto_news_publisher_throttle_state');
    expect(ddls[1]).toContain('crypto_news_publisher_queue');
    expect(ddls[2]).toContain('crypto_news_publisher_prompt_templates');
    expect(ddls[3]).toContain('crypto_news_publisher_llm_config');
    expect(ddls[4]).toContain('crypto_news_publisher_keywords');
    expect(ddls[5]).toContain('blacklist_phrases');
  });
});
