import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import {
  HealthController,
  HealthResponse,
  ChannelMetadata,
} from './health.controller';
import { StreamService } from 'stream/application/services/stream.service';
import { TelegramClientManager } from 'core/infrastructure/services/telegram-client-manager.service';
import { FloodWaitCounterService } from 'core/infrastructure/services/flood-wait-counter.service';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

/**
 * Mock TelegramClientManager (real class shape: gap-2 honest wiring)
 *
 * Mirrors the minimal health contract on the real TelegramClientManager:
 * sync isConnected/isAuthorized booleans + nullable last-poll timestamp.
 */
interface MockTelegramClientManager {
  isConnected: jest.Mock;
  isAuthorized: jest.Mock;
  getLastPollTimestamp: jest.Mock;
}

/**
 * Mock FloodWaitCounter interface
 *
 * Simulates flood wait tracking for health metrics.
 */
interface MockFloodWaitCounter {
  getCount24h: jest.Mock;
  getMaxSeconds24h: jest.Mock;
  getConsecutiveFailures: jest.Mock;
}

/**
 * Integration tests for HealthController
 *
 * **Validates: Requirements 5.1, 5.4, 5.5**
 *
 * Tests health endpoint behavior with different TelegramClientManager states:
 * - Connected state returns HTTP 200
 * - Disconnected state returns HTTP 503
 * - Channels endpoint returns correct metadata structure
 */
describe('HealthController', () => {
  let controller: HealthController;
  let streamService: StreamService;
  let mockClientManager: MockTelegramClientManager;
  let mockFloodWaitCounter: MockFloodWaitCounter;
  let mockFeedSourceRepo: { findAllActiveWithTypes: jest.Mock };

  beforeEach(async () => {
    // Create mock implementations
    mockClientManager = {
      isConnected: jest.fn().mockResolvedValue(true),
      isAuthorized: jest.fn().mockResolvedValue(true),
      getLastPollTimestamp: jest
        .fn()
        .mockReturnValue(new Date('2026-08-30T00:00:00Z')),
    };

    mockFloodWaitCounter = {
      getCount24h: jest.fn().mockReturnValue(0),
      getMaxSeconds24h: jest.fn().mockReturnValue(0),
      getConsecutiveFailures: jest.fn().mockReturnValue(0),
    };

    mockFeedSourceRepo = {
      findAllActiveWithTypes: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: StreamService,
          useValue: {
            getClientCount: jest.fn().mockReturnValue(0),
          },
        },
        {
          provide: TelegramClientManager,
          useValue: mockClientManager,
        },
        {
          provide: FloodWaitCounterService,
          useValue: mockFloodWaitCounter,
        },
        {
          provide: TelegramFeedSourceRepository,
          useValue: mockFeedSourceRepo,
        },
        {
          provide: 'TelegramClientManager',
          useValue: mockClientManager,
        },
        {
          provide: 'FloodWaitCounter',
          useValue: mockFloodWaitCounter,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    streamService = module.get<StreamService>(StreamService);
  });

  describe('getHealth', () => {
    it('should return 200 status with ok health when MTProto is connected (Requirement 5.4)', async () => {
      // Arrange
      mockClientManager.isConnected.mockResolvedValue(true);
      mockClientManager.isAuthorized.mockResolvedValue(true);
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue([
        ...Array.from({ length: 10 }, (_, i) => ({
          channelId: `-100kol${i}`,
          title: `KOL ${i}`,
          type: 'kol',
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          channelId: `-100news${i}`,
          title: `News ${i}`,
          type: 'crypto-news',
        })),
      ]);
      mockClientManager.getLastPollTimestamp.mockReturnValue(
        new Date('2026-08-30T00:00:00Z'),
      );

      jest.spyOn(streamService, 'getClientCount').mockReturnValue(3);

      // Create mock response
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          mtproto: expect.objectContaining({
            connected: true,
            authorized: true,
          }),
          clients: expect.objectContaining({
            connected: 3,
          }),
          channels: expect.objectContaining({
            total: 15,
            active: 15,
            kol: 10,
            news: 5,
          }),
        }),
      );
    });

    it('should return 503 status when MTProto is disconnected (Requirement 5.5)', async () => {
      // Arrange
      mockClientManager.isConnected.mockResolvedValue(false);
      mockClientManager.isAuthorized.mockResolvedValue(true);
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue([
        ...Array.from({ length: 10 }, (_, i) => ({
          channelId: `-100kol${i}`,
          title: `KOL ${i}`,
          type: 'kol',
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          channelId: `-100news${i}`,
          title: `News ${i}`,
          type: 'crypto-news',
        })),
      ]);
      mockClientManager.getLastPollTimestamp.mockReturnValue(
        new Date('2026-08-30T00:00:00Z'),
      );

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          mtproto: expect.objectContaining({
            connected: false,
            authorized: true,
          }),
        }),
      );
    });

    it('should return 503 status when MTProto is not authorized (Requirement 5.5)', async () => {
      // Arrange
      mockClientManager.isConnected.mockResolvedValue(true);
      mockClientManager.isAuthorized.mockResolvedValue(false);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          mtproto: expect.objectContaining({
            connected: true,
            authorized: false,
          }),
        }),
      );
    });

    it('should return 503 status when MTProto is neither connected nor authorized', async () => {
      // Arrange
      mockClientManager.isConnected.mockResolvedValue(false);
      mockClientManager.isAuthorized.mockResolvedValue(false);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          mtproto: expect.objectContaining({
            connected: false,
            authorized: false,
          }),
        }),
      );
    });

    it('should include correct uptime in milliseconds', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const mockResponse2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.getHealth(mockResponse2);

      // Assert
      const firstCall = mockResponse.json.mock.calls[0][0];
      const secondCall = mockResponse2.json.mock.calls[0][0];

      expect(secondCall.uptime).toBeGreaterThan(firstCall.uptime);
      expect(typeof secondCall.uptime).toBe('number');
    });

    it('should reflect connected SSE clients count', async () => {
      // Arrange - Simulate varying client counts
      const clientCounts = [0, 1, 5, 10];

      for (const count of clientCounts) {
        jest.spyOn(streamService, 'getClientCount').mockReturnValue(count);

        const mockResponse = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        } as any;

        // Act
        await controller.getHealth(mockResponse);

        // Assert
        const response = mockResponse.json.mock.calls[0][0];
        expect(response.clients.connected).toBe(count);
      }
    });

    it('should include lastPollAt timestamp in ISO format', async () => {
      // Arrange
      const testDate = new Date('2026-08-30T12:34:56Z');
      mockClientManager.getLastPollTimestamp.mockReturnValue(testDate);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.mtproto.lastPollAt).toBe('2026-08-30T12:34:56.000Z');

      // Should be parseable as Date
      const lastPollDate = new Date(response.mtproto.lastPollAt);
      expect(lastPollDate).toBeInstanceOf(Date);
      expect(isNaN(lastPollDate.getTime())).toBe(false);
    });

    it('should return channel statistics from the feed registry (Requirement 5.2)', async () => {
      // Arrange
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue([
        ...Array.from({ length: 15 }, (_, i) => ({
          channelId: `-100kol${i}`,
          title: `KOL ${i}`,
          type: 'kol',
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          channelId: `-100news${i}`,
          title: `News ${i}`,
          type: 'crypto-news',
        })),
      ]);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.channels).toEqual({
        total: 25,
        active: 25,
        kol: 15,
        news: 10,
      });
    });

    it('should include floodWait metrics when FloodWaitCounter is available (Requirement 5.6)', async () => {
      // Arrange
      mockFloodWaitCounter.getCount24h.mockReturnValue(5);
      mockFloodWaitCounter.getMaxSeconds24h.mockReturnValue(120);
      mockFloodWaitCounter.getConsecutiveFailures.mockReturnValue(2);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.floodWait).toEqual({
        count24h: 5,
        maxSeconds24h: 120,
        consecutiveFailures: 2,
      });
    });

    it('should handle zero connected clients gracefully', async () => {
      // Arrange
      jest.spyOn(streamService, 'getClientCount').mockReturnValue(0);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.clients.connected).toBe(0);
      expect(response.status).toBe('ok'); // Service can be healthy with no clients
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should include all required health response fields (Requirement 5.1, 5.2)', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert - Verify complete HealthResponse interface
      const response = mockResponse.json.mock.calls[0][0];

      const requiredFields = [
        'status',
        'mtproto',
        'channels',
        'clients',
        'uptime',
      ];

      for (const field of requiredFields) {
        expect(response).toHaveProperty(field);
      }

      // MTProto nested fields
      expect(response.mtproto).toHaveProperty('connected');
      expect(response.mtproto).toHaveProperty('authorized');
      expect(response.mtproto).toHaveProperty('lastPollAt');

      // Channels nested fields
      expect(response.channels).toHaveProperty('total');
      expect(response.channels).toHaveProperty('active');
      expect(response.channels).toHaveProperty('kol');
      expect(response.channels).toHaveProperty('news');

      // Clients nested fields
      expect(response.clients).toHaveProperty('connected');
    });

    it('should handle multiple concurrent health checks', async () => {
      // Arrange
      jest.spyOn(streamService, 'getClientCount').mockReturnValue(5);

      // Act - Fire multiple requests concurrently
      const mockResponses = Array.from({ length: 10 }, () => ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      })) as any[];

      await Promise.all(
        mockResponses.map((mockResponse) => controller.getHealth(mockResponse)),
      );

      // Assert - All should succeed and return consistent data
      mockResponses.forEach((mockResponse) => {
        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
        const response = mockResponse.json.mock.calls[0][0];
        expect(response.status).toBe('ok');
        expect(response.clients.connected).toBe(5);
        expect(response.uptime).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getReadiness', () => {
    it('should return ready status with timestamp and client count', async () => {
      // Arrange
      jest.spyOn(streamService, 'getClientCount').mockReturnValue(5);

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('ready');
      expect(result.timestamp).toBeDefined();
      expect(result.connectedClients).toBe(5);

      // Verify timestamp is valid ISO string
      const timestamp = new Date(result.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });

    it('should return ready even with no connected clients', async () => {
      // Arrange
      jest.spyOn(streamService, 'getClientCount').mockReturnValue(0);

      // Act
      const result = await controller.getReadiness();

      // Assert
      expect(result.status).toBe('ready');
      expect(result.connectedClients).toBe(0);
    });
  });

  describe('getLiveness', () => {
    it('should return alive status with timestamp and uptime', async () => {
      // Act
      const result = await controller.getLiveness();

      // Assert
      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);

      // Verify timestamp is valid ISO string
      const timestamp = new Date(result.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });

    it('should increment uptime over time', async () => {
      // Act
      const result1 = await controller.getLiveness();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await controller.getLiveness();

      // Assert
      expect(result2.uptime).toBeGreaterThan(result1.uptime);
    });
  });

  describe('getChannels', () => {
    it('should return array of channel metadata from the feed registry (Requirement 5.3)', async () => {
      // Arrange
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue([
        {
          channelId: '-1001234567890',
          title: 'Crypto News Channel',
          type: 'crypto-news',
        },
        {
          channelId: '-1009876543210',
          title: 'KOL Alpha Signals',
          type: 'kol',
        },
      ]);

      // Act
      const result: ChannelMetadata[] = await controller.getChannels();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result).toEqual([
        {
          id: '-1001234567890',
          title: 'Crypto News Channel',
          type: 'crypto-news',
        },
        { id: '-1009876543210', title: 'KOL Alpha Signals', type: 'kol' },
      ]);
    });

    it('should return empty array when no channels seeded', async () => {
      // Arrange
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue([]);

      // Act
      const result = await controller.getChannels();

      // Assert
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('should return channels with correct metadata structure (Requirement 5.3)', async () => {
      // Arrange
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue([
        { channelId: '-1001234567890', title: 'Test Channel', type: 'kol' },
      ]);

      // Act
      const result = await controller.getChannels();

      // Assert
      expect(result[0]).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        type: expect.stringMatching(/^(kol|crypto-news)$/),
      });

      // Verify required fields
      expect(result[0].id).toBe('-1001234567890');
      expect(result[0].title).toBe('Test Channel');
      expect(result[0].type).toBe('kol');
    });

    it('should fail open with empty array when the registry read throws', async () => {
      // Arrange
      mockFeedSourceRepo.findAllActiveWithTypes.mockRejectedValue(
        new Error('DB down'),
      );

      // Act
      const result = await controller.getChannels();

      // Assert
      expect(result).toEqual([]);
    });

    it('should validate channel type is either kol or crypto-news', async () => {
      // Arrange
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue([
        { channelId: '-1001111111111', title: 'KOL Channel', type: 'kol' },
        {
          channelId: '-1002222222222',
          title: 'News Channel',
          type: 'crypto-news',
        },
      ]);

      // Act
      const result = await controller.getChannels();

      // Assert
      result.forEach((channel) => {
        expect(['kol', 'crypto-news']).toContain(channel.type);
      });
    });

    it('should handle large number of channels', async () => {
      // Arrange
      const sources: Array<{
        channelId: string;
        title: string;
        type: 'kol' | 'crypto-news';
      }> = Array.from({ length: 100 }, (_, i) => ({
        channelId: `-100${i}`,
        title: `Channel ${i}`,
        type: i % 2 === 0 ? 'kol' : 'crypto-news',
      }));
      mockFeedSourceRepo.findAllActiveWithTypes.mockResolvedValue(sources);

      // Act
      const result = await controller.getChannels();

      // Assert
      expect(result.length).toBe(100);
      expect(result[0]).toEqual({
        id: '-1000',
        title: 'Channel 0',
        type: 'kol',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle StreamService returning negative client count gracefully', async () => {
      // Arrange - This should never happen, but test defensive behavior
      jest.spyOn(streamService, 'getClientCount').mockReturnValue(-1);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert - Should still return the value without crashing
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.clients.connected).toBe(-1);
      expect(response.status).toBe('ok');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should handle very large uptime values', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(typeof response.uptime).toBe('number');
      expect(response.uptime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(response.uptime)).toBe(true);
      expect(Number.isNaN(response.uptime)).toBe(false);
    });

    it('should degrade (503) when TelegramClientManager probe fails instead of throwing', async () => {
      // Arrange
      mockClientManager.isConnected.mockRejectedValue(
        new Error('Connection check failed'),
      );

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert - honest degraded, never a 500/throw and never fake-healthy
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.status).toBe('degraded');
      expect(response.mtproto.connected).toBe(false);
      expect(response.warnings).toContain('mtproto-connected-probe-failed');
    });
  });

  describe('health response validation', () => {
    it('should have status as one of the expected values', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(['ok', 'degraded', 'unhealthy']).toContain(response.status);
    });

    it('should have boolean MTProto connection flags', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(typeof response.mtproto.connected).toBe('boolean');
      expect(typeof response.mtproto.authorized).toBe('boolean');
    });

    it('should have numeric uptime and client counts', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(typeof response.uptime).toBe('number');
      expect(typeof response.clients.connected).toBe('number');
      expect(typeof response.channels.total).toBe('number');
      expect(typeof response.channels.active).toBe('number');
      expect(typeof response.channels.kol).toBe('number');
      expect(typeof response.channels.news).toBe('number');
    });

    it('should have ISO 8601 timestamp for lastPollAt', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.mtproto.lastPollAt).toBeDefined();

      // Should match ISO 8601 format
      expect(response.mtproto.lastPollAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );

      // Should be a valid date
      const date = new Date(response.mtproto.lastPollAt);
      expect(isNaN(date.getTime())).toBe(false);
    });

    it('should omit lastPollAt instead of faking now when no poll clock exists', async () => {
      // Arrange
      mockClientManager.getLastPollTimestamp.mockReturnValue(null);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect('lastPollAt' in response.mtproto).toBe(false);
    });
  });

  describe('honest wiring (gap 2)', () => {
    it('should degrade with a reason when TelegramClientManager is not wired', async () => {
      // Arrange
      const unwired = new HealthController(
        { getClientCount: () => 0 } as StreamService,
        undefined,
        undefined,
        undefined,
      );

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await unwired.getHealth(mockResponse);

      // Assert - never fake-healthy
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.status).toBe('degraded');
      expect(response.mtproto.connected).toBe(false);
      expect(response.mtproto.authorized).toBe(false);
      expect(response.warnings).toContain('mtproto-manager-unavailable');
      expect(response.channels).toEqual({
        total: 0,
        active: 0,
        kol: 0,
        news: 0,
      });
    });

    it('should zero channels with a warning when the registry read fails', async () => {
      // Arrange
      mockFeedSourceRepo.findAllActiveWithTypes.mockRejectedValue(
        new Error('DB down'),
      );

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.channels).toEqual({
        total: 0,
        active: 0,
        kol: 0,
        news: 0,
      });
      expect(response.warnings).toContain('channel-registry-read-failed');
    });

    it('should omit floodWait when FloodWaitCounter is not wired', async () => {
      // Arrange
      const noCounter = new HealthController(
        { getClientCount: () => 0 } as StreamService,
        mockClientManager as unknown as TelegramClientManager,
        undefined,
        mockFeedSourceRepo as unknown as TelegramFeedSourceRepository,
      );

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await noCounter.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect('floodWait' in response).toBe(false);
    });

    it('should always expose imageRevision without changing the shape', async () => {
      // Arrange
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert - additive-only T2 field, defaults to unknown
      const response = mockResponse.json.mock.calls[0][0];
      expect(typeof response.imageRevision).toBe('string');
      expect(response.imageRevision.length).toBeGreaterThan(0);
    });
  });
});
