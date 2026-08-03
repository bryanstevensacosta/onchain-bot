import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { InMemoryCryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-message.repository';

describe('InMemoryCryptoNewsMessageRepository', () => {
  let repo: InMemoryCryptoNewsMessageRepository;

  beforeEach(() => {
    repo = new InMemoryCryptoNewsMessageRepository();
  });

  it('saves and retrieves a message by id', async () => {
    const msg = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 1,
      title: 'Title',
      content: 'body',
      publishedAt: new Date(),
    });
    await repo.save(msg);
    const found = await repo.findById(msg.id);
    expect(found).toBe(msg);
  });

  it('findRecent returns messages sorted by ingestedAt desc', async () => {
    const older = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 1,
      title: null,
      content: 'older',
      publishedAt: new Date(),
      ingestedAt: new Date('2026-01-01'),
    });
    const newer = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 2,
      title: null,
      content: 'newer',
      publishedAt: new Date(),
      ingestedAt: new Date('2026-01-02'),
    });
    await repo.save(older);
    await repo.save(newer);
    const recent = await repo.findRecent(10);
    expect(recent[0].id).toBe(newer.id);
    expect(recent[1].id).toBe(older.id);
  });

  it('findRecent respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      const msg = CryptoNewsMessage.create({
        channelId: '123',
        messageId: i,
        title: null,
        content: `body-${i}`,
        publishedAt: new Date(),
        ingestedAt: new Date(`2026-01-0${i + 1}`),
      });
      await repo.save(msg);
    }
    const recent = await repo.findRecent(3);
    expect(recent).toHaveLength(3);
  });

  it('findByChannelId filters by channel and sorts desc', async () => {
    const a = CryptoNewsMessage.create({
      channelId: '111',
      messageId: 1,
      title: null,
      content: 'a',
      publishedAt: new Date(),
      ingestedAt: new Date('2026-01-01'),
    });
    const b = CryptoNewsMessage.create({
      channelId: '222',
      messageId: 1,
      title: null,
      content: 'b',
      publishedAt: new Date(),
      ingestedAt: new Date('2026-01-02'),
    });
    const a2 = CryptoNewsMessage.create({
      channelId: '111',
      messageId: 2,
      title: null,
      content: 'a2',
      publishedAt: new Date(),
      ingestedAt: new Date('2026-01-03'),
    });
    await repo.save(a);
    await repo.save(b);
    await repo.save(a2);
    const result = await repo.findByChannelId('111', 10);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(a2.id);
    expect(result[1].id).toBe(a.id);
  });

  describe('retention window (since filter)', () => {
    const HOUR = 3600 * 1000;
    const NOW = new Date('2026-02-01T00:00:00.000Z');
    let origDateNow: () => number;

    beforeEach(() => {
      origDateNow = Date.now;
      Date.now = () => NOW.getTime();
    });

    afterEach(() => {
      Date.now = origDateNow;
    });

    it('excludes a message older than 48h when since = now-48h', async () => {
      const cutoff = new Date(NOW.getTime() - 48 * HOUR);
      const old = CryptoNewsMessage.create({
        channelId: 'c1',
        messageId: 1,
        title: null,
        content: 'old',
        publishedAt: new Date(),
        ingestedAt: new Date(cutoff.getTime() - 24 * HOUR), // 72h old
      });
      const recent = CryptoNewsMessage.create({
        channelId: 'c1',
        messageId: 2,
        title: null,
        content: 'recent',
        publishedAt: new Date(),
        ingestedAt: new Date(cutoff.getTime() + 1 * HOUR), // 47h old
      });
      await repo.save(old);
      await repo.save(recent);

      const result = await repo.findRecent(50, cutoff);
      expect(result.map((m) => m.id)).toEqual([recent.id]);
    });

    it('INCLUDES a message whose ingestedAt is exactly equal to since (boundary)', async () => {
      const cutoff = new Date(NOW.getTime() - 48 * HOUR);
      const boundary = CryptoNewsMessage.create({
        channelId: 'c1',
        messageId: 3,
        title: null,
        content: 'boundary',
        publishedAt: new Date(),
        ingestedAt: new Date(cutoff.getTime()), // exactly == since
      });
      await repo.save(boundary);

      const result = await repo.findRecent(50, cutoff);
      expect(result.map((m) => m.id)).toEqual([boundary.id]);
    });

    it('findByChannelId honours the same boundary contract', async () => {
      const cutoff = new Date(NOW.getTime() - 48 * HOUR);
      const old = CryptoNewsMessage.create({
        channelId: 'c1',
        messageId: 1,
        title: null,
        content: 'old',
        publishedAt: new Date(),
        ingestedAt: new Date(cutoff.getTime() - 24 * HOUR), // 72h old
      });
      const boundary = CryptoNewsMessage.create({
        channelId: 'c1',
        messageId: 2,
        title: null,
        content: 'boundary',
        publishedAt: new Date(),
        ingestedAt: new Date(cutoff.getTime()), // exactly == since
      });
      const otherChannel = CryptoNewsMessage.create({
        channelId: 'c2',
        messageId: 1,
        title: null,
        content: 'other',
        publishedAt: new Date(),
        ingestedAt: new Date(cutoff.getTime()), // exactly == since, but different channel
      });
      await repo.save(old);
      await repo.save(boundary);
      await repo.save(otherChannel);

      const result = await repo.findByChannelId('c1', 50, cutoff);
      expect(result.map((m) => m.id)).toEqual([boundary.id]);
    });
  });
});
