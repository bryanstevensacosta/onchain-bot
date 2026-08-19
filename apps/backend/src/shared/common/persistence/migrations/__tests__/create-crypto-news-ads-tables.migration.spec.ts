import type { QueryRunner } from 'typeorm';
import { CreateCryptoNewsAdsTables1805000000000 } from '../1805000000000-create-crypto-news-ads-tables';

describe('CreateCryptoNewsAdsTables1805000000000 migration', () => {
  const migration = new CreateCryptoNewsAdsTables1805000000000();

  function createQueryRunner(): {
    runner: QueryRunner;
    query: jest.Mock;
  } {
    const query = jest.fn();
    return { runner: { query } as unknown as QueryRunner, query };
  }

  it('up() creates the 5 tables with column-exact assertions', async () => {
    const { runner, query } = createQueryRunner();

    await migration.up(runner);

    const ddls = query.mock.calls.map((c) => String(c[0]));

    // 5 CREATE TABLE statements + 2 indexes
    const createTableDdls = ddls.filter((d) =>
      d.startsWith('CREATE TABLE IF NOT EXISTS'),
    );
    expect(createTableDdls).toHaveLength(5);

    const regularIndexDdls = ddls.filter((d) =>
      d.startsWith('CREATE INDEX IF NOT EXISTS'),
    );
    expect(regularIndexDdls).toHaveLength(2);
    expect(ddls).toHaveLength(7);

    // --- crypto_news_ads ---
    const ads = createTableDdls.find((d) => d.includes('crypto_news_ads ('))!;
    expect(ads).toContain('id uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(ads).toContain('name varchar(128) NOT NULL');
    expect(ads).toContain('CONSTRAINT uq_crypto_news_ads_name UNIQUE (name)');
    expect(ads).toContain('body text NOT NULL');
    expect(ads).toContain('image_media_id uuid NULL');
    expect(ads).toContain('enabled boolean NOT NULL DEFAULT true');
    expect(ads).toContain('"order" integer NOT NULL DEFAULT 0');
    expect(ads).toContain('times_published integer NOT NULL DEFAULT 0');
    expect(ads).toContain('consecutive_failures integer NOT NULL DEFAULT 0');
    expect(ads).toContain('last_published_at timestamptz NULL');
    expect(ads).toContain('expires_at timestamptz NULL');
    expect(ads).toContain(
      "expiration_action varchar(8) NOT NULL DEFAULT 'disable'",
    );
    expect(ads).toContain("format varchar(16) NOT NULL DEFAULT 'text'");
    expect(ads).toContain('video_media_id varchar(255) NULL');
    expect(ads).toContain('album_media_ids jsonb NULL');
    expect(ads).toContain('buttons jsonb NULL');
    expect(ads).toContain('created_at timestamptz NOT NULL DEFAULT now()');
    expect(ads).toContain('updated_at timestamptz NOT NULL DEFAULT now()');

    expect(
      regularIndexDdls.some(
        (d) =>
          d.includes('idx_crypto_news_ads_enabled_order') &&
          d.includes('crypto_news_ads (enabled, "order")'),
      ),
    ).toBe(true);
    expect(
      regularIndexDdls.some(
        (d) =>
          d.includes('idx_crypto_news_ads_expires_at') &&
          d.includes('crypto_news_ads (expires_at)'),
      ),
    ).toBe(true);

    // --- crypto_news_ads_throttle_state ---
    const throttleState = createTableDdls.find((d) =>
      d.includes('crypto_news_ads_throttle_state ('),
    )!;
    expect(throttleState).toContain('id integer PRIMARY KEY');
    expect(throttleState).not.toMatch(/id integer PRIMARY KEY.*SERIAL/);
    expect(throttleState).toContain('last_publish_at timestamptz NULL');
    expect(throttleState).toContain(
      'updated_at timestamptz NOT NULL DEFAULT now()',
    );

    // --- crypto_news_ad_rotation_config ---
    const rotationConfig = createTableDdls.find((d) =>
      d.includes('crypto_news_ad_rotation_config ('),
    )!;
    expect(rotationConfig).toContain('id integer PRIMARY KEY');
    expect(rotationConfig).not.toMatch(/id integer PRIMARY KEY.*SERIAL/);
    expect(rotationConfig).toContain('enabled boolean NOT NULL DEFAULT false');
    expect(rotationConfig).toContain(
      'every_n_posts integer NOT NULL DEFAULT 4',
    );
    expect(rotationConfig).toContain(
      'min_minutes_between_ads integer NOT NULL DEFAULT 30',
    );
    expect(rotationConfig).toContain(
      'created_at timestamptz NOT NULL DEFAULT now()',
    );
    expect(rotationConfig).toContain(
      'updated_at timestamptz NOT NULL DEFAULT now()',
    );

    // --- crypto_news_ad_rotation_state ---
    const rotationState = createTableDdls.find((d) =>
      d.includes('crypto_news_ad_rotation_state ('),
    )!;
    expect(rotationState).toContain('id integer PRIMARY KEY');
    expect(rotationState).not.toMatch(/id integer PRIMARY KEY.*SERIAL/);
    expect(rotationState).toContain(
      'posts_since_last_ad integer NOT NULL DEFAULT 0',
    );
    expect(rotationState).toContain('last_ad_id uuid NULL');
    expect(rotationState).toContain('last_ad_published_at timestamptz NULL');
    expect(rotationState).toContain(
      'updated_at timestamptz NOT NULL DEFAULT now()',
    );

    // --- crypto_news_publisher_slot_state ---
    const slotState = createTableDdls.find((d) =>
      d.includes('crypto_news_publisher_slot_state ('),
    )!;
    expect(slotState).toContain('id integer PRIMARY KEY');
    expect(slotState).not.toMatch(/id integer PRIMARY KEY.*SERIAL/);
    expect(slotState).toContain('last_scope varchar(16) NULL');
    expect(slotState).toContain(
      "CONSTRAINT ck_slot_state_last_scope CHECK (last_scope IN ('news', 'ads'))",
    );
    expect(slotState).toContain('last_publish_at timestamptz NULL');
    expect(slotState).toContain(
      'min_seconds_between_slots integer NOT NULL DEFAULT 60',
    );
    expect(slotState).toContain(
      'updated_at timestamptz NOT NULL DEFAULT now()',
    );
  });

  it('down() drops all 5 tables', async () => {
    const { runner, query } = createQueryRunner();

    await migration.down(runner);

    expect(query).toHaveBeenCalledTimes(5);
    const ddls = query.mock.calls.map((c) => String(c[0]));
    ddls.forEach((d) => expect(d).toContain('DROP TABLE IF EXISTS'));

    expect(ddls[0]).toContain('crypto_news_publisher_slot_state');
    expect(ddls[1]).toContain('crypto_news_ad_rotation_state');
    expect(ddls[2]).toContain('crypto_news_ad_rotation_config');
    expect(ddls[3]).toContain('crypto_news_ads_throttle_state');
    expect(ddls[4]).toContain('crypto_news_ads');
  });
});
