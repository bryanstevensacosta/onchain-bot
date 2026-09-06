import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BackendChannelProviderService } from './backend-channel-provider.service';

describe('BackendChannelProviderService', () => {
  let service: BackendChannelProviderService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackendChannelProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'BACKEND_PORT') return '3030';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BackendChannelProviderService>(
      BackendChannelProviderService,
    );
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerBackend', () => {
    it('should register a backend with its source whitelist', () => {
      const backendId = 'production';
      const sourceWhitelist = ['channel1', 'channel2', 'channel3'];

      service.registerBackend(backendId, sourceWhitelist);

      const registeredIds = service.getRegisteredBackendIds();
      expect(registeredIds).toContain(backendId);
    });

    it('should replace existing registration when re-registering same backend', () => {
      const backendId = 'production';
      const firstWhitelist = ['channel1', 'channel2'];
      const secondWhitelist = ['channel3', 'channel4', 'channel5'];

      service.registerBackend(backendId, firstWhitelist);
      service.registerBackend(backendId, secondWhitelist);

      const registeredIds = service.getRegisteredBackendIds();
      expect(registeredIds).toHaveLength(1);
      expect(registeredIds[0]).toBe(backendId);
    });
  });

  describe('getChannelUnionSize', () => {
    it('should return 0 when no backends are registered', () => {
      expect(service.getChannelUnionSize()).toBe(0);
    });

    it('should return correct size for single backend', () => {
      service.registerBackend('production', [
        'channel1',
        'channel2',
        'channel3',
      ]);
      expect(service.getChannelUnionSize()).toBe(3);
    });

    it('should compute union correctly for multiple backends with no overlap', () => {
      service.registerBackend('production', ['channel1', 'channel2']);
      service.registerBackend('staging', ['channel3', 'channel4']);

      expect(service.getChannelUnionSize()).toBe(4);
    });

    it('should compute union correctly for multiple backends with overlap', () => {
      service.registerBackend('production', [
        'channel1',
        'channel2',
        'channel3',
      ]);
      service.registerBackend('staging', ['channel2', 'channel3', 'channel4']);

      // Union: channel1, channel2, channel3, channel4 = 4 unique channels
      expect(service.getChannelUnionSize()).toBe(4);
    });

    it('should compute union correctly for multiple backends with complete overlap', () => {
      service.registerBackend('production', ['channel1', 'channel2']);
      service.registerBackend('staging', ['channel1', 'channel2']);

      expect(service.getChannelUnionSize()).toBe(2);
    });
  });

  describe('getRegisteredBackendIds', () => {
    it('should return empty array when no backends registered', () => {
      expect(service.getRegisteredBackendIds()).toEqual([]);
    });

    it('should return all registered backend IDs', () => {
      service.registerBackend('production', ['channel1']);
      service.registerBackend('staging', ['channel2']);
      service.registerBackend('development', ['channel3']);

      const ids = service.getRegisteredBackendIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('production');
      expect(ids).toContain('staging');
      expect(ids).toContain('development');
    });
  });

  describe('recordDisconnect', () => {
    it('should record disconnection for registered backend', () => {
      const backendId = 'production';
      service.registerBackend(backendId, ['channel1']);

      // Should not throw
      expect(() => service.recordDisconnect(backendId)).not.toThrow();
    });

    it('should handle disconnection for non-existent backend gracefully', () => {
      // Should not throw
      expect(() => service.recordDisconnect('non-existent')).not.toThrow();
    });
  });

  describe('computeChannelUnionFromRegistrations', () => {
    it('should return empty arrays and union when no backends registered', () => {
      const result = service.computeChannelUnionFromRegistrations();

      expect(result.kolIds).toEqual([]);
      expect(result.newsIds).toEqual([]);
      expect(result.channelUnion).toEqual([]);
    });

    it('should return channel union for single backend', () => {
      service.registerBackend('production', [
        'channel1',
        'channel2',
        'channel3',
      ]);

      const result = service.computeChannelUnionFromRegistrations();

      expect(result.channelUnion).toHaveLength(3);
      expect(result.channelUnion).toContain('channel1');
      expect(result.channelUnion).toContain('channel2');
      expect(result.channelUnion).toContain('channel3');
    });

    it('should deduplicate overlapping channels from multiple backends', () => {
      service.registerBackend('production', [
        'channel1',
        'channel2',
        'channel3',
      ]);
      service.registerBackend('staging', ['channel2', 'channel3', 'channel4']);

      const result = service.computeChannelUnionFromRegistrations();

      expect(result.channelUnion).toHaveLength(4);
      expect(result.channelUnion).toContain('channel1');
      expect(result.channelUnion).toContain('channel2');
      expect(result.channelUnion).toContain('channel3');
      expect(result.channelUnion).toContain('channel4');
    });

    it('should compute union from 3+ backends with complex overlap', () => {
      service.registerBackend('production', [
        'channel1',
        'channel2',
        'channel3',
      ]);
      service.registerBackend('staging', ['channel2', 'channel3', 'channel4']);
      service.registerBackend('development', [
        'channel1',
        'channel4',
        'channel5',
      ]);

      const result = service.computeChannelUnionFromRegistrations();

      // Union: channel1, channel2, channel3, channel4, channel5
      expect(result.channelUnion).toHaveLength(5);
      expect(result.channelUnion).toContain('channel1');
      expect(result.channelUnion).toContain('channel2');
      expect(result.channelUnion).toContain('channel3');
      expect(result.channelUnion).toContain('channel4');
      expect(result.channelUnion).toContain('channel5');
    });

    it('should handle complete overlap across all backends', () => {
      service.registerBackend('production', ['channel1', 'channel2']);
      service.registerBackend('staging', ['channel1', 'channel2']);
      service.registerBackend('development', ['channel1', 'channel2']);

      const result = service.computeChannelUnionFromRegistrations();

      expect(result.channelUnion).toHaveLength(2);
      expect(result.channelUnion).toContain('channel1');
      expect(result.channelUnion).toContain('channel2');
    });

    it('should handle empty whitelists', () => {
      service.registerBackend('production', []);
      service.registerBackend('staging', ['channel1']);

      const result = service.computeChannelUnionFromRegistrations();

      expect(result.channelUnion).toHaveLength(1);
      expect(result.channelUnion).toContain('channel1');
    });

    it('should return kolIds and newsIds as empty arrays (backward compatibility)', () => {
      service.registerBackend('production', ['channel1', 'channel2']);

      const result = service.computeChannelUnionFromRegistrations();

      // Per design: classification happens in IngestionCoordinator, not here
      expect(result.kolIds).toEqual([]);
      expect(result.newsIds).toEqual([]);
      expect(result.channelUnion.length).toBeGreaterThan(0);
    });
  });

  describe('fetchAllActiveChannelIds', () => {
    // Mock global fetch
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should use channel union when backends are registered', async () => {
      // Mock feature flag enabled
      configService.get = jest.fn().mockImplementation((key: string) =>
        key === 'app.multiBackend.enabled' ? true : undefined,
      );
      service.registerBackend('production', ['channel1', 'channel2']);
      service.registerBackend('staging', ['channel2', 'channel3']);

      const result = await service.fetchAllActiveChannelIds();

      // Should use registrations, not HTTP
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result).toContain('channel1');
      expect(result).toContain('channel2');
      expect(result).toContain('channel3');
    });

    it('should fall back to HTTP polling when no backends registered', async () => {
      const mockKolIds = ['kol1', 'kol2'];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockKolIds,
      });

      const result = await service.fetchAllActiveChannelIds();

      // Only 1 HTTP call (crypto-news endpoint deprecated, returns [] without HTTP)
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3030/telegram-kol/identity/kols/active/ids',
      );
      // Only KOL IDs returned (crypto-news deprecated)
      expect(result).toHaveLength(2);
      expect(result).toEqual(mockKolIds);
    });

    it('should prefer registrations over HTTP even when HTTP would return data', async () => {
      // Mock feature flag enabled
      configService.get = jest.fn().mockImplementation((key: string) =>
        key === 'app.multiBackend.enabled' ? true : undefined,
      );
      service.registerBackend('production', ['reg-channel1', 'reg-channel2']);

      // Mock HTTP endpoints (should not be called)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ['http-channel1'],
      });

      const result = await service.fetchAllActiveChannelIds();

      // Registrations take precedence
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toEqual(['reg-channel1', 'reg-channel2']);
    });

    it('should return empty array when no registrations and HTTP fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await service.fetchAllActiveChannelIds();

      expect(result).toEqual([]);
    });

    it('should combine KOL and news IDs from HTTP fallback', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ['kol1'],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [], // Deprecated endpoint returns []
        });

      const result = await service.fetchAllActiveChannelIds();

      // Only KOL ID returned (crypto-news endpoint deprecated)
      expect(result).toEqual(['kol1']);
    });

    it('should handle empty registrations as no registrations (fall back to HTTP)', async () => {
      // Register then manually clear (simulating unregister scenario)
      service.registerBackend('temp', ['channel1']);
      // Access private Map to clear it for testing

      (service as any).registrations.clear();

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ['http-kol'],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [], // Deprecated endpoint returns []
        });

      const result = await service.fetchAllActiveChannelIds();

      expect(global.fetch).toHaveBeenCalled();
      // Only KOL ID returned (crypto-news endpoint deprecated)
      expect(result).toEqual(['http-kol']);
    });
  });

  describe('computeChannelDiff', () => {
    // Access private method via type assertion for testing
    const callComputeChannelDiff = (
      service: BackendChannelProviderService,
      oldUnion: Set<string>,
      newUnion: Set<string>,
    ): { added: string[]; removed: string[] } => {
      return (service as any).computeChannelDiff(oldUnion, newUnion);
    };

    it('should return empty diff when unions are identical', () => {
      const oldUnion = new Set(['channel1', 'channel2', 'channel3']);
      const newUnion = new Set(['channel1', 'channel2', 'channel3']);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
    });

    it('should correctly identify added channels', () => {
      const oldUnion = new Set(['channel1', 'channel2']);
      const newUnion = new Set([
        'channel1',
        'channel2',
        'channel3',
        'channel4',
      ]);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toHaveLength(2);
      expect(diff.added).toContain('channel3');
      expect(diff.added).toContain('channel4');
      expect(diff.removed).toEqual([]);
    });

    it('should correctly identify removed channels', () => {
      const oldUnion = new Set([
        'channel1',
        'channel2',
        'channel3',
        'channel4',
      ]);
      const newUnion = new Set(['channel1', 'channel2']);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toHaveLength(2);
      expect(diff.removed).toContain('channel3');
      expect(diff.removed).toContain('channel4');
    });

    it('should correctly identify simultaneous adds and removes', () => {
      const oldUnion = new Set(['channel1', 'channel2', 'channel3']);
      const newUnion = new Set([
        'channel2',
        'channel3',
        'channel4',
        'channel5',
      ]);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toHaveLength(2);
      expect(diff.added).toContain('channel4');
      expect(diff.added).toContain('channel5');
      expect(diff.removed).toHaveLength(1);
      expect(diff.removed).toContain('channel1');
    });

    it('should handle empty old union (all channels added)', () => {
      const oldUnion = new Set<string>();
      const newUnion = new Set(['channel1', 'channel2', 'channel3']);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toHaveLength(3);
      expect(diff.added).toContain('channel1');
      expect(diff.added).toContain('channel2');
      expect(diff.added).toContain('channel3');
      expect(diff.removed).toEqual([]);
    });

    it('should handle empty new union (all channels removed)', () => {
      const oldUnion = new Set(['channel1', 'channel2', 'channel3']);
      const newUnion = new Set<string>();

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toHaveLength(3);
      expect(diff.removed).toContain('channel1');
      expect(diff.removed).toContain('channel2');
      expect(diff.removed).toContain('channel3');
    });

    it('should handle both unions empty', () => {
      const oldUnion = new Set<string>();
      const newUnion = new Set<string>();

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
    });

    it('should handle complete replacement of channels', () => {
      const oldUnion = new Set(['channel1', 'channel2', 'channel3']);
      const newUnion = new Set(['channel4', 'channel5', 'channel6']);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toHaveLength(3);
      expect(diff.added).toContain('channel4');
      expect(diff.added).toContain('channel5');
      expect(diff.added).toContain('channel6');
      expect(diff.removed).toHaveLength(3);
      expect(diff.removed).toContain('channel1');
      expect(diff.removed).toContain('channel2');
      expect(diff.removed).toContain('channel3');
    });

    it('should handle single channel addition', () => {
      const oldUnion = new Set(['channel1']);
      const newUnion = new Set(['channel1', 'channel2']);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toEqual(['channel2']);
      expect(diff.removed).toEqual([]);
    });

    it('should handle single channel removal', () => {
      const oldUnion = new Set(['channel1', 'channel2']);
      const newUnion = new Set(['channel1']);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual(['channel2']);
    });

    it('should preserve channel ID strings exactly', () => {
      // Test with realistic Telegram channel IDs (numeric strings with -100 prefix)
      const oldUnion = new Set(['-1001234567890', '-1009876543210']);
      const newUnion = new Set(['-1001234567890', '-1005555555555']);

      const diff = callComputeChannelDiff(service, oldUnion, newUnion);

      expect(diff.added).toEqual(['-1005555555555']);
      expect(diff.removed).toEqual(['-1009876543210']);
    });
  });
});
