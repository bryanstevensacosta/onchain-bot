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
});
