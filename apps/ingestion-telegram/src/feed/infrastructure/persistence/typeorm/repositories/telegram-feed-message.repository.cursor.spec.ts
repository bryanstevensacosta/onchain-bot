/**
 * Keyset cursor pagination specs for `TelegramFeedMessageRepository`.
 *
 * Runs against the ISOLATED test database (`ingestion_telegram_db_test`) —
 * same harness as `telegram-feed-message.repository.spec.ts`.
 *
 * Covers:
 * - page-through determinism (union of pages == full ordered set, no dups)
 * - new-rows-during-paging (cursor stability: inserts after page 1 do not
 *   duplicate or skip rows on page 2)
 * - adversarial: duplicate/missed rows across pages (explicit overlap check)
 * - type filter composes with the cursor
 */
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { TelegramFeedMessageEntity } from '../entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from '../entities/telegram-feed-message-media.entity';
import { TelegramFeedMessageRepository } from './telegram-feed-message.repository';
import { decodeFeedCursor } from 'feed/feed-cursor';

const TEST_DB = 'ingestion_telegram_db_test';

function testDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.INGESTION_DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.INGESTION_DATABASE_PORT ?? '5432', 10),
    username: process.env.INGESTION_DATABASE_USER ?? 'onchain_bot',
    password: process.env.INGESTION_DATABASE_PASSWORD ?? 'onchain_bot',
    database: TEST_DB,
    entities: [TelegramFeedMessageEntity, TelegramFeedMessageMediaEntity],
    synchronize: true,
    logging: false,
  });
}

async function ensureTestDatabase(): Promise<void> {
  const admin = new DataSource({
    type: 'postgres',
    host: process.env.INGESTION_DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.INGESTION_DATABASE_PORT ?? '5432', 10),
    username: process.env.INGESTION_DATABASE_USER ?? 'onchain_bot',
    password: process.env.INGESTION_DATABASE_PASSWORD ?? 'onchain_bot',
    database: 'postgres',
    logging: false,
  });
  await admin.initialize();
  try {
    const rows: Array<{ exists: boolean }> = await admin.query(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [TEST_DB],
    );
    if (!rows[0]?.exists) {
      await admin.query(`CREATE DATABASE "${TEST_DB}"`);
    }
  } finally {
    await admin.destroy();
  }
}

describe('TelegramFeedMessageRepository (cursor pagination)', () => {
  let ds: DataSource;
  let repo: TelegramFeedMessageRepository;

  beforeAll(async () => {
    await ensureTestDatabase();
    ds = testDataSource();
    await ds.initialize();
    repo = new TelegramFeedMessageRepository(
      ds.getRepository(TelegramFeedMessageEntity),
    );
  }, 60_000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  beforeEach(async () => {
    await ds.query('DELETE FROM "telegram_feed_message_media"');
    await ds.query('DELETE FROM "telegram_feed_messages"');
  });

  function makeMessage(
    channelId: string,
    messageId: number,
    publishedAt: Date,
    overrides?: Partial<TelegramFeedMessageEntity>,
  ): TelegramFeedMessageEntity {
    const e = new TelegramFeedMessageEntity();
    e.id = randomUUID();
    e.channelId = channelId;
    e.messageId = messageId;
    e.type = 'crypto-news';
    e.title = null;
    e.content = `feed content ${channelId}:${messageId}`;
    e.publishedAt = publishedAt;
    e.ingestedAt = new Date('2026-09-21T10:05:00Z');
    e.linkPreviewUrl = null;
    e.linkPreviewTitle = null;
    e.linkPreviewDescription = null;
    e.linkPreviewSiteName = null;
    e.messageEntities = null;
    e.groupedId = null;
    e.media = [];
    return Object.assign(e, overrides);
  }

  async function seedFive(): Promise<TelegramFeedMessageEntity[]> {
    const rows: TelegramFeedMessageEntity[] = [];
    for (let n = 1; n <= 5; n += 1) {
      const row = await repo.save(
        makeMessage('-1001', n, new Date(Date.UTC(2026, 8, 21, 8 + n))),
      );
      rows.push(row);
    }
    // Newest-first expectation: messageIds [5, 4, 3, 2, 1].
    return rows;
  }

  async function collectAll(
    limit: number,
    type?: 'kol' | 'crypto-news',
  ): Promise<{ ids: string[]; pages: number }> {
    const ids: string[] = [];
    let pages = 0;
    let cursor: { publishedAt: Date; id: string } | undefined;
    for (;;) {
      const page = await repo.findRecentPaged(limit, type, cursor);
      pages += 1;
      ids.push(...page.rows.map((r) => r.id));
      if (page.nextCursor === null) break;
      cursor = decodeFeedCursor(page.nextCursor);
      if (pages > 10) throw new Error('pagination did not terminate');
    }
    return { ids, pages };
  }

  it('pages through deterministically with no duplicates and null at the end', async () => {
    const seeded = await seedFive();
    const expected = [...seeded].reverse().map((r) => r.id);

    const { ids, pages } = await collectAll(2);

    expect(pages).toBe(3);
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('repeated page-through returns the same order (determinism)', async () => {
    await seedFive();

    const first = await collectAll(2);
    const second = await collectAll(2);

    expect(second.ids).toEqual(first.ids);
  });

  it('new rows during paging do not duplicate or skip older rows (cursor stability)', async () => {
    await seedFive();

    const page1 = await repo.findRecentPaged(2);
    expect(page1.rows.map((r) => r.messageId)).toEqual([5, 4]);
    expect(page1.nextCursor).not.toBeNull();

    // Two newer rows arrive between page 1 and page 2.
    await repo.save(makeMessage('-1001', 6, new Date('2026-09-21T15:00:00Z')));
    await repo.save(makeMessage('-1001', 7, new Date('2026-09-21T16:00:00Z')));

    const cursor = decodeFeedCursor(page1.nextCursor as string);
    const page2 = await repo.findRecentPaged(2, undefined, cursor);

    // The keyset resumes exactly after the page-1 anchor: no dup, no skip.
    expect(page2.rows.map((r) => r.messageId)).toEqual([3, 2]);
    expect(page2.rows.some((r) => page1.rows.some((p) => p.id === r.id))).toBe(
      false,
    );
  });

  it('adversarial: full overlap check across pages (no dup, no miss)', async () => {
    const seeded = await seedFive();
    const allIds = new Set(seeded.map((r) => r.id));

    const seen = new Set<string>();
    let cursor: { publishedAt: Date; id: string } | undefined;
    let dups = 0;
    for (;;) {
      const page = await repo.findRecentPaged(2, undefined, cursor);
      for (const row of page.rows) {
        if (seen.has(row.id)) dups += 1;
        seen.add(row.id);
      }
      if (page.nextCursor === null) break;
      cursor = decodeFeedCursor(page.nextCursor);
    }

    expect(dups).toBe(0);
    expect(seen).toEqual(allIds);
  });

  it('type filter composes with the cursor', async () => {
    await repo.save(
      makeMessage('-1001', 1, new Date('2026-09-21T09:00:00Z'), {
        type: 'kol',
      }),
    );
    await repo.save(
      makeMessage('-1001', 2, new Date('2026-09-21T10:00:00Z'), {
        type: 'crypto-news',
      }),
    );
    await repo.save(
      makeMessage('-1001', 3, new Date('2026-09-21T11:00:00Z'), {
        type: 'kol',
      }),
    );

    const { ids } = await collectAll(1, 'kol');

    expect(ids).toHaveLength(2);
    const onlyKol = await repo.findRecentPaged(10, 'kol');
    expect(onlyKol.rows.every((r) => r.type === 'kol')).toBe(true);
    expect(onlyKol.nextCursor).toBeNull();
  });

  it('first page without cursor matches legacy findRecent order', async () => {
    await seedFive();

    const legacy = await repo.findRecent(3);
    const paged = await repo.findRecentPaged(3);

    expect(paged.rows.map((r) => r.id)).toEqual(legacy.map((r) => r.id));
    expect(paged.nextCursor).not.toBeNull();
  });

  it('returns null nextCursor when the table holds fewer rows than the limit', async () => {
    await repo.save(makeMessage('-1001', 1, new Date('2026-09-21T09:00:00Z')));

    const page = await repo.findRecentPaged(50);

    expect(page.rows).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
