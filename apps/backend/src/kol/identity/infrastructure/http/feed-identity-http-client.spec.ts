import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import {
  FeedIdentityHttpClient,
  type FeedKolSourceDto,
} from './feed-identity-http-client';

/**
 * Item 8 (telegram-feed-unification): `FeedIdentityHttpClient` serves
 * `KolRepository` READS from `GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`,
 * fail-open (`[]`/`null`, never breaks boot), and throws 501 on writes.
 */
describe('FeedIdentityHttpClient', () => {
  const mockFetch = jest.fn();

  function makeClient(): FeedIdentityHttpClient {
    const config = {
      get: (key: string) => {
        if (key === 'app') {
          return { ingestion: { serviceUrl: 'http://feed:3031' } };
        }
        return undefined;
      },
    } as unknown as ConfigService;
    return new FeedIdentityHttpClient(config);
  }

  function makeKeyedClient(apiKey: string): FeedIdentityHttpClient {
    const config = {
      get: (key: string) => {
        if (key === 'app') {
          return {
            ingestion: { serviceUrl: 'http://feed:3031', apiKey },
          };
        }
        return undefined;
      },
    } as unknown as ConfigService;
    return new FeedIdentityHttpClient(config);
  }

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const feedRows: FeedKolSourceDto[] = [
    {
      channelId: '-100111',
      handle: '@AlphaCalls',
      title: 'Alpha Calls',
      type: 'kol',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      channelId: '-100222',
      handle: 'not a valid handle!!',
      title: 'Paused Channel',
      type: 'kol',
      isActive: false,
      lifecycleStatus: 'INACTIVE',
      addedAt: '2026-01-02T00:00:00.000Z',
    },
  ];

  function mockOk(rows: unknown): void {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => rows,
    });
  }

  it('findAll maps feed rows to Kol aggregates (INACTIVE→DORMANT, bad handle→null)', async () => {
    mockOk(feedRows);
    const client = makeClient();

    const kols = await client.findAll();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://feed:3031/api/feed/sources?type=kol',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(kols).toHaveLength(2);
    expect(kols[0].kolId.value).toBe('-100111');
    expect(kols[0].handle?.value).toBe('AlphaCalls');
    expect(kols[0].lifecycleStatus).toBe('ACTIVE');
    expect(kols[0].isActive).toBe(true);
    expect(kols[1].lifecycleStatus).toBe('DORMANT');
    expect(kols[1].handle).toBeNull();
    // Feed list endpoint omits last_ingested_at (owned by ingestion now)
    expect(kols[0].lastIngestedAt).toBeNull();
  });

  it('findById returns the matching Kol, null when absent', async () => {
    mockOk(feedRows);
    const client = makeClient();

    const found = await client.findById(KolId.fromString('-100111'));
    expect(found?.title).toBe('Alpha Calls');

    const missing = await client.findById(KolId.fromString('-100999'));
    expect(missing).toBeNull();
  });

  it('findActive mirrors TypeOrm semantics (isActive + ACTIVE)', async () => {
    mockOk(feedRows);
    const client = makeClient();

    const active = await client.findActive();
    expect(active.map((k) => k.kolId.value)).toEqual(['-100111']);
  });

  it('fail-open []/null when ingestion is down (never breaks boot)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = makeClient();

    await expect(client.findAll()).resolves.toEqual([]);
    await expect(
      client.findById(KolId.fromString('-100111')),
    ).resolves.toBeNull();
    await expect(client.findActive()).resolves.toEqual([]);
  });

  it('fail-open [] on non-2xx and unexpected shapes', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const client = makeClient();
    await expect(client.findAll()).resolves.toEqual([]);

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(client.findAll()).resolves.toEqual([]);
  });

  it('writes throw 501 with the feed hint', async () => {
    const client = makeClient();
    const kol = Kol.create({
      id: KolId.fromString('-100111'),
      handle: null,
      title: 't',
    });

    await expect(client.save(kol)).rejects.toBeInstanceOf(HttpException);
    await expect(client.save(kol)).rejects.toMatchObject({ status: 501 });
    await expect(
      client.delete(KolId.fromString('-100111')),
    ).rejects.toMatchObject({ status: 501 });
    await expect(
      client.updateTitle(KolId.fromString('-100111'), 'New'),
    ).rejects.toMatchObject({ status: 501 });
    // No HTTP write attempted
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends no x-api-key header when key is unset (keyless dev)', async () => {
    mockOk(feedRows);
    const client = makeClient();

    await client.findAll();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const init = mockFetch.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['x-api-key']).toBeUndefined();
  });

  it('sends x-api-key header when configured', async () => {
    mockOk(feedRows);
    const client = makeKeyedClient('secret-key');

    await client.findAll();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const init = mockFetch.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'secret-key',
    });
  });
});
