import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HealthController, HealthResponse, ChannelMetadata } from './health.controller';
import { StreamService } from 'stream/application/services/stream.service';
import { DisconnectionTracker } from 'stream/application/services/disconnection-tracker.service';

/**
 * Mock TelegramClientManager interface
 * 
 * Simulates the TelegramClientManager that will be injected when MTProto layer is wired.
 * Allows testing different connection states (connected/disconnected).
 */
interface MockTelegramClientManager {
  isConnected: jest.Mock;
  isAuthorized: jest.Mock;
  getLastPollTimestamp: jest.Mock;
  getChannelCount: jest.Mock;
  getActiveChannelCount: jest.Mock;
  getKolChannelCount: jest.Mock;
  getNewsChannelCount: jest.Mock;
  getChannelMetadata: jest.Mock;
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
  let disconnectionTracker: DisconnectionTracker;
  let mockClientManager: MockTelegramClientManager;
  let mockFloodWaitCounter: MockFloodWaitCounter;

  beforeEach(async () => {
    // Create mock implementations
    mockClientManager = {
      isConnected: jest.fn().mockResolvedValue(true),
      isAuthorized: jest.fn().mockResolvedValue(true),
      getLastPollTimestamp: jest.fn().mockReturnValue(new Date('2026-08-30T00:00:00Z')),
      getChannelCount: jest.fn().mockReturnValue(15),
      getActiveChannelCount: jest.fn().mockReturnValue(15),
      getKolChannelCount: jest.fn().mockReturnValue(10),
      getNewsChannelCount: jest.fn().mockReturnValue(5),
      getChannelMetadata: jest.fn().mockReturnValue([]),
    };

    mockFloodWaitCounter = {
      getCount24h: jest.fn().mockReturnValue(0),
      getMaxSeconds24h: jest.fn().mockReturnValue(0),
      getConsecutiveFailures: jest.fn().mockReturnValue(0),
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
          provide: DisconnectionTracker,
          useClass: DisconnectionTracker,
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
    disconnectionTracker = module.get<DisconnectionTracker>(DisconnectionTracker);
  });

  describe('getHealth', () => {
    it('should return 200 status with ok health when MTProto is connected (Requirement 5.4)', async () => {
      // Arrange
      mockClientManager.isConnected.mockResolvedValue(true);
      mockClientManager.isAuthorized.mockResolvedValue(true);
      mockClientManager.getChannelCount.mockReturnValue(15);
      mockClientManager.getActiveChannelCount.mockReturnValue(15);
      mockClientManager.getKolChannelCount.mockReturnValue(10);
      mockClientManager.getNewsChannelCount.mockReturnValue(5);
      mockClientManager.getLastPollTimestamp.mockReturnValue(new Date('2026-08-30T00:00:00Z'));
      
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
      mockClientManager.getChannelCount.mockReturnValue(15);
      mockClientManager.getActiveChannelCount.mockReturnValue(0); // No active channels when disconnected
      mockClientManager.getKolChannelCount.mockReturnValue(10);
      mockClientManager.getNewsChannelCount.mockReturnValue(5);
      mockClientManager.getLastPollTimestamp.mockReturnValue(new Date('2026-08-30T00:00:00Z'));

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
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
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
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
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
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

    it('should return channel statistics from TelegramClientManager (Requirement 5.2)', async () => {
      // Arrange
      mockClientManager.getChannelCount.mockReturnValue(25);
      mockClientManager.getActiveChannelCount.mockReturnValue(20);
      mockClientManager.getKolChannelCount.mockReturnValue(15);
      mockClientManager.getNewsChannelCount.mockReturnValue(10);

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
        active: 20,
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
    it('should return array of channel metadata (Requirement 5.3)', async () => {
      // Arrange
      const mockChannels: ChannelMetadata[] = [
        {
          id: '-1001234567890',
          title: 'Crypto News Channel',
          handle: '@cryptonews',
          participantCount: 15000,
          type: 'crypto-news',
          joinedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: '-1009876543210',
          title: 'KOL Alpha Signals',
          handle: '@kolalpha',
          participantCount: 5000,
          type: 'kol',
          joinedAt: '2026-02-01T00:00:00Z',
        },
      ];

      mockClientManager.getChannelMetadata.mockReturnValue(mockChannels);

      // Act
      const result: ChannelMetadata[] = await controller.getChannels();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result).toEqual(mockChannels);
    });

    it('should return empty array when no channels seeded', async () => {
      // Arrange
      mockClientManager.getChannelMetadata.mockReturnValue([]);

      // Act
      const result = await controller.getChannels();

      // Assert
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('should return channels with correct metadata structure (Requirement 5.3)', async () => {
      // Arrange
      const mockChannels: ChannelMetadata[] = [
        {
          id: '-1001234567890',
          title: 'Test Channel',
          handle: '@testchannel',
          participantCount: 1000,
          type: 'kol',
          joinedAt: '2026-01-15T10:30:00Z',
        },
      ];

      mockClientManager.getChannelMetadata.mockReturnValue(mockChannels);

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

      // Verify optional fields when present
      expect(result[0].handle).toBe('@testchannel');
      expect(result[0].participantCount).toBe(1000);
      expect(result[0].joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should handle channels with missing optional fields', async () => {
      // Arrange
      const mockChannels: ChannelMetadata[] = [
        {
          id: '-1001234567890',
          title: 'Minimal Channel',
          type: 'crypto-news',
        },
      ];

      mockClientManager.getChannelMetadata.mockReturnValue(mockChannels);

      // Act
      const result = await controller.getChannels();

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('-1001234567890');
      expect(result[0].title).toBe('Minimal Channel');
      expect(result[0].type).toBe('crypto-news');
      expect(result[0].handle).toBeUndefined();
      expect(result[0].participantCount).toBeUndefined();
      expect(result[0].joinedAt).toBeUndefined();
    });

    it('should validate channel type is either kol or crypto-news', async () => {
      // Arrange
      const mockChannels: ChannelMetadata[] = [
        {
          id: '-1001111111111',
          title: 'KOL Channel',
          type: 'kol',
        },
        {
          id: '-1002222222222',
          title: 'News Channel',
          type: 'crypto-news',
        },
      ];

      mockClientManager.getChannelMetadata.mockReturnValue(mockChannels);

      // Act
      const result = await controller.getChannels();

      // Assert
      result.forEach((channel) => {
        expect(['kol', 'crypto-news']).toContain(channel.type);
      });
    });

    it('should handle large number of channels', async () => {
      // Arrange
      const mockChannels: ChannelMetadata[] = Array.from({ length: 100 }, (_, i) => ({
        id: `-100${i}`,
        title: `Channel ${i}`,
        type: i % 2 === 0 ? ('kol' as const) : ('crypto-news' as const),
      }));

      mockClientManager.getChannelMetadata.mockReturnValue(mockChannels);

      // Act
      const result = await controller.getChannels();

      // Assert
      expect(result.length).toBe(100);
      expect(result).toEqual(mockChannels);
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

    it('should handle TelegramClientManager async errors gracefully', async () => {
      // Arrange
      mockClientManager.isConnected.mockRejectedValue(new Error('Connection check failed'));

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act & Assert
      await expect(controller.getHealth(mockResponse)).rejects.toThrow('Connection check failed');
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
      expect(response.mtproto.lastPollAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      
      // Should be a valid date
      const date = new Date(response.mtproto.lastPollAt);
      expect(isNaN(date.getTime())).toBe(false);
    });
  });

  describe('disconnection window tracking (GAP 3)', () => {
    it('should include disconnectionWindows in health response', async () => {
      // Arrange
      disconnectionTracker.recordDisconnection('client-1');
      disconnectionTracker.recordReconnection('client-1');

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.clients.disconnectionWindows).toBeDefined();
      expect(Array.isArray(response.clients.disconnectionWindows)).toBe(true);
    });

    it('should include disconnection window details', async () => {
      // Arrange
      disconnectionTracker.recordDisconnection('client-1');
      disconnectionTracker.recordReconnection('client-1');

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      const windows = response.clients.disconnectionWindows;
      expect(windows.length).toBe(1);
      expect(windows[0]).toHaveProperty('clientId');
      expect(windows[0]).toHaveProperty('disconnectedAt');
      expect(windows[0]).toHaveProperty('reconnectedAt');
      expect(windows[0]).toHaveProperty('durationMs');
    });

    it('should add WARNING flag when disconnection window exceeds 60s', async () => {
      // Arrange - Mock a long disconnection (>60s)
      const clientId = 'client-1';
      const longAgo = new Date(Date.now() - 61_000);
      disconnectionTracker['activeDisconnections'].set(clientId, longAgo);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.warnings).toBeDefined();
      expect(Array.isArray(response.warnings)).toBe(true);
      expect(response.warnings).toContain('Client disconnection window >60s detected');
    });

    it('should NOT add WARNING flag when all windows are under 60s', async () => {
      // Arrange - Mock a short disconnection (<60s)
      disconnectionTracker.recordDisconnection('client-1');
      disconnectionTracker.recordReconnection('client-1');

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.warnings).toBeUndefined();
    });

    it('should handle multiple disconnection windows', async () => {
      // Arrange
      disconnectionTracker.recordDisconnection('client-1');
      disconnectionTracker.recordReconnection('client-1');
      disconnectionTracker.recordDisconnection('client-2');
      disconnectionTracker.recordReconnection('client-2');
      disconnectionTracker.recordDisconnection('client-3'); // Still disconnected

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      const windows = response.clients.disconnectionWindows;
      expect(windows.length).toBe(3);
      
      // Check we have both completed and active windows
      const completedWindows = windows.filter((w: any) => w.reconnectedAt !== null);
      const activeWindows = windows.filter((w: any) => w.reconnectedAt === null);
      expect(completedWindows.length).toBe(2);
      expect(activeWindows.length).toBe(1);
    });

    it('should return empty disconnectionWindows array when no disconnections', async () => {
      // Arrange
      disconnectionTracker.clear();

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Act
      await controller.getHealth(mockResponse);

      // Assert
      const response = mockResponse.json.mock.calls[0][0];
      expect(response.clients.disconnectionWindows).toEqual([]);
    });
  });
});
