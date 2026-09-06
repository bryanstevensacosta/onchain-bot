import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { InMemoryCryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-source.repository';

// SKIPPED: Backend crypto-news repository tests deprecated after 2026-09-05 migration
// Repository write methods (save/delete) now throw errors - ingestion-service owns crypto-news sources
// These tests verify deprecated write behavior that should no longer be used
describe.skip('InMemoryCryptoNewsSourceRepository', () => {
  let repo: InMemoryCryptoNewsSourceRepository;

  beforeEach(() => {
    repo = new InMemoryCryptoNewsSourceRepository();
  });

  it('saves and retrieves a source by channelId', async () => {
    const source = CryptoNewsSource.create({
      channelId: '1234567890',
      handle: null,
      title: 'Test',
    });
    await repo.save(source);
    const found = await repo.findByChannelId('1234567890');
    expect(found).toBe(source);
  });

  it('returns null for non-existent channelId', async () => {
    const found = await repo.findByChannelId('nope');
    expect(found).toBeNull();
  });

  it('findAll returns all sources', async () => {
    const a = CryptoNewsSource.create({
      channelId: '111',
      handle: null,
      title: 'A',
    });
    const b = CryptoNewsSource.create({
      channelId: '222',
      handle: null,
      title: 'B',
    });
    await repo.save(a);
    await repo.save(b);
    expect(await repo.findAll()).toHaveLength(2);
  });

  it('findActive returns only isActive=true sources', async () => {
    const a = CryptoNewsSource.create({
      channelId: '111',
      handle: null,
      title: 'A',
    });
    const b = CryptoNewsSource.create({
      channelId: '222',
      handle: null,
      title: 'B',
    });
    a.activate();
    await repo.save(a);
    await repo.save(b);
    const active = await repo.findActive();
    expect(active).toHaveLength(1);
    expect(active[0].channelId).toBe('111');
  });

  it('deletes a source by channelId', async () => {
    const source = CryptoNewsSource.create({
      channelId: '111',
      handle: null,
      title: 'A',
    });
    await repo.save(source);
    await repo.delete('111');
    expect(await repo.findByChannelId('111')).toBeNull();
  });
});
