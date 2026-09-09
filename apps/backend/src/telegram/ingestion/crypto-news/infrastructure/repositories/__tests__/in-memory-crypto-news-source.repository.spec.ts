import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { InMemoryCryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-source.repository';

// Backend crypto-news repository deprecated after 2026-09-05 migration
// Write methods (save/delete) now throw errors - verify deprecated behavior
describe('InMemoryCryptoNewsSourceRepository - DEPRECATED', () => {
  let repo: InMemoryCryptoNewsSourceRepository;

  beforeEach(() => {
    repo = new InMemoryCryptoNewsSourceRepository();
  });

  it('save() throws error indicating deprecated functionality', async () => {
    const source = CryptoNewsSource.create({
      channelId: '1234567890',
      handle: null,
      title: 'Test',
    });

    await expect(repo.save(source)).rejects.toThrow(
      /deprecated|ingestion-service/i,
    );
  });

  it('delete() throws error indicating deprecated functionality', async () => {
    await expect(repo.delete('111')).rejects.toThrow(
      /deprecated|ingestion-service/i,
    );
  });

  it('read methods still work for backward compatibility', async () => {
    // findByChannelId, findAll, findActive should still function for read-only access
    const found = await repo.findByChannelId('nope');
    expect(found).toBeNull();

    const all = await repo.findAll();
    expect(Array.isArray(all)).toBe(true);

    const active = await repo.findActive();
    expect(Array.isArray(active)).toBe(true);
  });
});
