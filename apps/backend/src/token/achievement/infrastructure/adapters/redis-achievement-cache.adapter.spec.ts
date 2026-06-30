import { RedisAchievementCacheAdapter } from './redis-milestone-cache.adapter';

interface FakeClient {
  smembers: jest.Mock;
  sadd: jest.Mock;
  expire: jest.Mock;
  del: jest.Mock;
}

interface FakeRedisService {
  isEnabled: jest.Mock;
  getClient: jest.Mock;
}

function makeRedis(
  opts: {
    enabled: boolean;
    client?: FakeClient;
  } = { enabled: true },
): FakeRedisService {
  const client: FakeClient = opts.client ?? {
    smembers: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
  };
  return {
    isEnabled: jest.fn().mockReturnValue(opts.enabled),
    getClient: jest.fn().mockReturnValue(client),
  };
}

function makeAdapter(redis: FakeRedisService): {
  adapter: RedisAchievementCacheAdapter;
  client: FakeClient;
  redis: FakeRedisService;
} {
  const adapter = new RedisAchievementCacheAdapter(redis as never);
  return { adapter, client: redis.getClient() as FakeClient, redis };
}

describe('RedisAchievementCacheAdapter', () => {
  describe('getNotifiedThresholds', () => {
    it('returns empty Set when redis is disabled (no client call)', async () => {
      const { adapter, client } = makeAdapter(makeRedis({ enabled: false }));
      const result = await adapter.getNotifiedThresholds('call-1');
      expect(result.size).toBe(0);
      expect(client.smembers).not.toHaveBeenCalled();
    });

    it('returns empty Set when key does not exist (smembers returns [])', async () => {
      const client: FakeClient = {
        smembers: jest.fn().mockResolvedValue([]),
        sadd: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      const result = await adapter.getNotifiedThresholds('call-1');
      expect(result.size).toBe(0);
    });

    it('parses string members as numbers into a Set', async () => {
      const client: FakeClient = {
        smembers: jest.fn().mockResolvedValue(['2', '5', '10']),
        sadd: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      const result = await adapter.getNotifiedThresholds('call-1');
      expect(result).toEqual(new Set([2, 5, 10]));
    });

    it('filters out non-finite values from smembers', async () => {
      const client: FakeClient = {
        smembers: jest
          .fn()
          .mockResolvedValue(['2', 'not-a-number', 'NaN', '5']),
        sadd: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      const result = await adapter.getNotifiedThresholds('call-1');
      expect(result).toEqual(new Set([2, 5]));
    });

    it('uses the achievement:notified: key prefix', async () => {
      const client: FakeClient = {
        smembers: jest.fn().mockResolvedValue([]),
        sadd: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await adapter.getNotifiedThresholds('solana:abc');
      expect(client.smembers).toHaveBeenCalledWith(
        'achievement:notified:solana:abc',
      );
    });

    it('returns empty Set + swallows error when smembers throws', async () => {
      const client: FakeClient = {
        smembers: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        sadd: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      const result = await adapter.getNotifiedThresholds('call-1');
      expect(result.size).toBe(0);
    });
  });

  describe('addNotifiedThreshold', () => {
    it('is no-op when redis is disabled', async () => {
      const { adapter, client } = makeAdapter(makeRedis({ enabled: false }));
      await adapter.addNotifiedThreshold('call-1', 5);
      expect(client.sadd).not.toHaveBeenCalled();
      expect(client.expire).not.toHaveBeenCalled();
    });

    it('calls sadd + expire with correct key + threshold', async () => {
      const client: FakeClient = {
        smembers: jest.fn(),
        sadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await adapter.addNotifiedThreshold('solana:abc', 5);
      expect(client.sadd).toHaveBeenCalledWith(
        'achievement:notified:solana:abc',
        '5',
      );
      expect(client.expire).toHaveBeenCalledWith(
        'achievement:notified:solana:abc',
        60 * 60 * 24 * 30,
      );
    });

    it('uses 30-day TTL (60 * 60 * 24 * 30 seconds)', async () => {
      const client: FakeClient = {
        smembers: jest.fn(),
        sadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await adapter.addNotifiedThreshold('call-1', 2);
      expect(client.expire).toHaveBeenCalledWith(
        'achievement:notified:call-1',
        2_592_000,
      );
    });

    it('converts threshold number to string for sadd', async () => {
      const client: FakeClient = {
        smembers: jest.fn(),
        sadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await adapter.addNotifiedThreshold('call-1', 7);
      const saddArg = client.sadd.mock.calls[0][1];
      expect(typeof saddArg).toBe('string');
      expect(saddArg).toBe('7');
    });

    it('swallows error when sadd throws', async () => {
      const client: FakeClient = {
        smembers: jest.fn(),
        sadd: jest.fn().mockRejectedValue(new Error('WRITE FAILED')),
        expire: jest.fn(),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await expect(
        adapter.addNotifiedThreshold('call-1', 5),
      ).resolves.toBeUndefined();
    });

    it('swallows error when expire throws (after sadd succeeded)', async () => {
      const client: FakeClient = {
        smembers: jest.fn(),
        sadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockRejectedValue(new Error('EXPIRE FAILED')),
        del: jest.fn(),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await expect(
        adapter.addNotifiedThreshold('call-1', 5),
      ).resolves.toBeUndefined();
    });
  });

  describe('invalidateCall', () => {
    it('is no-op when redis is disabled', async () => {
      const { adapter, client } = makeAdapter(makeRedis({ enabled: false }));
      await adapter.invalidateCall('call-1');
      expect(client.del).not.toHaveBeenCalled();
    });

    it('calls del with correct key', async () => {
      const client: FakeClient = {
        smembers: jest.fn(),
        sadd: jest.fn(),
        expire: jest.fn(),
        del: jest.fn().mockResolvedValue(1),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await adapter.invalidateCall('solana:abc');
      expect(client.del).toHaveBeenCalledWith('achievement:notified:solana:abc');
    });

    it('swallows error when del throws', async () => {
      const client: FakeClient = {
        smembers: jest.fn(),
        sadd: jest.fn(),
        expire: jest.fn(),
        del: jest.fn().mockRejectedValue(new Error('DEL FAILED')),
      };
      const { adapter } = makeAdapter(makeRedis({ enabled: true, client }));
      await expect(adapter.invalidateCall('call-1')).resolves.toBeUndefined();
    });
  });
});
