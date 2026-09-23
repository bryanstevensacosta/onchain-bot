/**
 * Repository roundtrip specs for `TelegramFeedMessageRepository`.
 *
 * Runs against an ISOLATED test database (`onchain_bot_test_entity`) on the
 * DEV postgres (localhost:5434) — never the dev-ingestion data DB and never
 * staging/prod. Port default is 5434 (NOT 5432: that is the prod server on
 * this host). Entities are synchronized (create-if-missing, no drops) and
 * rows are cleaned per test, so parallel items' suites sharing this DB are
 * unaffected.
 *
 * Covers (item 3 acceptance):
 * - repo roundtrip on the NEW table (`telegram_feed_messages`)
 * - `type` discriminator persistence (`crypto-news` + `kol` union)
 * - media cascade save on the new (message ↔ media) pair
 * - all 6 mirrored methods: findRecent / findByChannelId /
 *   findByChannelAndMessageId / save / count / countByChannelId
 */
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { TelegramFeedMessageEntity } from '../entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from '../entities/telegram-feed-message-media.entity';
import { TelegramFeedMessageRepository } from './telegram-feed-message.repository';

const TEST_DB = 'onchain_bot_test_entity';

function testDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.INGESTION_DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.INGESTION_DATABASE_PORT ?? '5434', 10),
    username: process.env.INGESTION_DATABASE_USER ?? 'alpha_meta_token_scanner',
    password:
      process.env.INGESTION_DATABASE_PASSWORD ?? 'alpha_meta_token_scanner',
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
    port: parseInt(process.env.INGESTION_DATABASE_PORT ?? '5434', 10),
    username: process.env.INGESTION_DATABASE_USER ?? 'alpha_meta_token_scanner',
    password:
      process.env.INGESTION_DATABASE_PASSWORD ?? 'alpha_meta_token_scanner',
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

describe('TelegramFeedMessageRepository (telegram_feed_messages roundtrip)', () => {
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
    overrides?: Partial<TelegramFeedMessageEntity>,
  ): TelegramFeedMessageEntity {
    const e = new TelegramFeedMessageEntity();
    e.id = randomUUID();
    e.channelId = channelId;
    e.messageId = messageId;
    e.type = 'crypto-news';
    e.title = null;
    e.content = `feed content ${channelId}:${messageId}`;
    e.publishedAt = new Date('2026-09-21T10:00:00Z');
    e.ingestedAt = new Date('2026-09-21T10:05:00Z');
    e.linkPreviewUrl = null;
    e.linkPreviewTitle = null;
    e.linkPreviewDescription = null;
    e.linkPreviewSiteName = null;
    e.messageEntities = [{ type: 'url', offset: 0, length: 10 }];
    e.groupedId = null;
    e.media = [];
    return Object.assign(e, overrides);
  }

  it('roundtrips save → findByChannelAndMessageId on the new table', async () => {
    await repo.save(makeMessage('-1001', 101));

    const found = await repo.findByChannelAndMessageId('-1001', 101);
    expect(found).not.toBeNull();
    expect(found?.content).toBe('feed content -1001:101');
    expect(found?.type).toBe('crypto-news');
    expect(found?.messageEntities).toEqual([
      { type: 'url', offset: 0, length: 10 },
    ]);
  });

  it('returns null for unknown (channelId, messageId)', async () => {
    await expect(
      repo.findByChannelAndMessageId('-1009', 999),
    ).resolves.toBeNull();
  });

  it('findRecent orders by publishedAt DESC with limit', async () => {
    await repo.save(
      makeMessage('-1001', 1, {
        publishedAt: new Date('2026-09-21T09:00:00Z'),
      }),
    );
    await repo.save(
      makeMessage('-1001', 2, {
        publishedAt: new Date('2026-09-21T11:00:00Z'),
      }),
    );
    await repo.save(
      makeMessage('-1002', 3, {
        publishedAt: new Date('2026-09-21T10:00:00Z'),
      }),
    );

    const recent = await repo.findRecent(2);
    expect(recent.map((m) => m.messageId)).toEqual([2, 3]);
  });

  it('findRecent with type=kol returns only kol rows (SQL-level filter)', async () => {
    await repo.save(makeMessage('-1001', 1, { type: 'kol' }));
    await repo.save(makeMessage('-1001', 2, { type: 'crypto-news' }));
    await repo.save(makeMessage('-1002', 3, { type: 'kol' }));

    const rows = await repo.findRecent(10, 'kol');
    expect(rows).toHaveLength(2);
    expect(rows.every((m) => m.type === 'kol')).toBe(true);
  });

  it('findRecent with type=crypto-news returns only news rows', async () => {
    await repo.save(makeMessage('-1001', 1, { type: 'kol' }));
    await repo.save(makeMessage('-1001', 2, { type: 'crypto-news' }));
    await repo.save(makeMessage('-1002', 3, { type: 'crypto-news' }));

    const rows = await repo.findRecent(10, 'crypto-news');
    expect(rows).toHaveLength(2);
    expect(rows.every((m) => m.type === 'crypto-news')).toBe(true);
  });

  it('findRecent without type returns mixed (legacy behavior unchanged)', async () => {
    await repo.save(makeMessage('-1001', 1, { type: 'kol' }));
    await repo.save(makeMessage('-1001', 2, { type: 'crypto-news' }));

    const rows = await repo.findRecent(10);
    expect(rows).toHaveLength(2);
  });

  it('findRecent cap applies AFTER type filtering', async () => {
    await repo.save(makeMessage('-1001', 1, { type: 'kol' }));
    await repo.save(makeMessage('-1001', 2, { type: 'crypto-news' }));
    await repo.save(makeMessage('-1002', 3, { type: 'crypto-news' }));

    const rows = await repo.findRecent(1, 'crypto-news');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('crypto-news');
  });

  it('findByChannelId scopes to one channel ordered DESC', async () => {
    await repo.save(makeMessage('-1001', 1));
    await repo.save(makeMessage('-1001', 2));
    await repo.save(makeMessage('-1002', 3));

    const rows = await repo.findByChannelId('-1001', 50);
    expect(rows).toHaveLength(2);
    expect(rows.every((m) => m.channelId === '-1001')).toBe(true);
  });

  it('count / countByChannelId mirror row totals', async () => {
    await repo.save(makeMessage('-1001', 1));
    await repo.save(makeMessage('-1001', 2));
    await repo.save(makeMessage('-1002', 3));

    await expect(repo.count()).resolves.toBe(3);
    await expect(repo.countByChannelId('-1001')).resolves.toBe(2);
    await expect(repo.countByChannelId('-1002')).resolves.toBe(1);
  });

  it("persists the 'kol' type union member", async () => {
    await repo.save(makeMessage('-1007', 7, { type: 'kol' }));

    const found = await repo.findByChannelAndMessageId('-1007', 7);
    expect(found?.type).toBe('kol');
  });

  it('persists NULL messageEntities (live-writer shape)', async () => {
    await repo.save(makeMessage('-1008', 8, { messageEntities: null }));

    const found = await repo.findByChannelAndMessageId('-1008', 8);
    expect(found?.messageEntities).toBeNull();
  });

  it('cascade-saves media children on the new (message ↔ media) pair', async () => {
    const parent = makeMessage('-1001', 42);
    const child = new TelegramFeedMessageMediaEntity();
    child.id = randomUUID();
    child.messageId = parent.id;
    child.index = 0;
    child.type = 'photo';
    child.filePath = 'uploads/feed/media/-1001/42_0.jpg';
    child.mimeType = 'image/jpeg';
    child.fileSize = 1234;
    child.createdAt = new Date();
    parent.media = [child];

    await repo.save(parent);

    const found = await repo.findByChannelAndMessageId('-1001', 42);
    expect(found?.media).toHaveLength(1);
    expect(found?.media[0]?.filePath).toBe('uploads/feed/media/-1001/42_0.jpg');
  });
});
