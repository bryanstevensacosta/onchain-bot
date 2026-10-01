import { KolAvatarResolverService } from './kol-avatar-resolver.service';
import type {
  KolIngestionClientPort,
  KolSource,
} from '../ports/ingestion-client.port';

function makeClient(sources: KolSource[]): KolIngestionClientPort {
  return {
    listKolSources: async () => sources,
    fetchRecentKolMessages: async () => [],
  };
}

describe('KolAvatarResolverService (rankings + caller display)', () => {
  it('resolves avatarUrl by channelId', async () => {
    const resolver = new KolAvatarResolverService(
      makeClient([
        {
          channelId: '-1001',
          title: 'Alpha',
          handle: 'alpha',
          type: 'kol',
          avatarUrl: '/api/kol-avatar/-1001',
        },
      ]),
    );
    await expect(resolver.resolveOne('-1001')).resolves.toBe(
      '/api/kol-avatar/-1001',
    );
  });

  it('resolves avatarUrl by handle (with or without @)', async () => {
    const resolver = new KolAvatarResolverService(
      makeClient([
        {
          channelId: '-1002',
          title: 'Beta',
          handle: 'beta',
          type: 'kol',
          avatarUrl: '/api/kol-avatar/-1002',
        },
      ]),
    );
    await expect(resolver.resolveOne('@beta')).resolves.toBe(
      '/api/kol-avatar/-1002',
    );
    await expect(resolver.resolveOne('beta')).resolves.toBe(
      '/api/kol-avatar/-1002',
    );
  });

  it('falls back to the servable placeholder URL for unknown callers', async () => {
    const resolver = new KolAvatarResolverService(makeClient([]));
    await expect(resolver.resolveOne('-1009')).resolves.toBe(
      '/api/kol-avatar/-1009',
    );
  });

  it('falls back to placeholder when the feed read fails (never throws)', async () => {
    const resolver = new KolAvatarResolverService({
      listKolSources: async () => {
        throw new Error('feed down');
      },
      fetchRecentKolMessages: async () => [],
    });
    await expect(resolver.resolveOne('-1001')).resolves.toBe(
      '/api/kol-avatar/-1001',
    );
  });

  it('resolves many callers with a single feed read', async () => {
    let reads = 0;
    const resolver = new KolAvatarResolverService({
      listKolSources: async () => {
        reads += 1;
        return [
          {
            channelId: '-1001',
            title: 'Alpha',
            handle: 'alpha',
            type: 'kol',
            avatarUrl: '/api/kol-avatar/-1001',
          },
        ];
      },
      fetchRecentKolMessages: async () => [],
    });
    const out = await resolver.resolveMany(['-1001', '-1009']);
    expect(out).toEqual({
      '-1001': '/api/kol-avatar/-1001',
      '-1009': '/api/kol-avatar/-1009',
    });
    expect(reads).toBe(1);
  });
});
