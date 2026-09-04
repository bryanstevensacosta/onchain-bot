import { Test, TestingModule } from '@nestjs/testing';
import { ServerResponse } from 'http';
import { SSEBroadcastService, BroadcastEvent } from './sse-broadcast.service';
import { MetricsService } from '../../../metrics/metrics.service';

/**
 * Unit tests for SSEBroadcastService
 *
 * Per Requirement 4.1: Test add/remove connections
 * Per Requirement 4.3: Test broadcast to multiple backends
 * Per Requirement 3.3: Test broadcast continues when individual backend fails
 * Per Requirement 6.1: Test metrics are incremented on broadcast
 */
describe('SSEBroadcastService', () => {
  let service: SSEBroadcastService;
  let mockMetricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    // Create mock MetricsService
    mockMetricsService = {
      sseClientsConnected: {
        set: jest.fn(),
      },
      messagesBroadcastTotal: {
        inc: jest.fn(),
      },
      activeBackends: {
        set: jest.fn(),
      },
      broadcastTotal: {
        inc: jest.fn(),
      },
      broadcastFailures: {
        inc: jest.fn(),
      },
    } as unknown as jest.Mocked<MetricsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SSEBroadcastService,
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<SSEBroadcastService>(SSEBroadcastService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addConnection', () => {
    it('should add a backend connection', () => {
      // Arrange
      const backendId = 'production';
      const mockResponse = createMockResponse();

      // Act
      service.addConnection(backendId, mockResponse);

      // Assert
      expect(service.getActiveBackendCount()).toBe(1);
      expect(service.isBackendConnected(backendId)).toBe(true);
    });

    it('should update metrics when connection is added', () => {
      // Arrange
      const backendId = 'production';
      const mockResponse = createMockResponse();

      // Act
      service.addConnection(backendId, mockResponse);

      // Assert
      expect(mockMetricsService.sseClientsConnected.set).toHaveBeenCalledWith(
        1,
      );
      expect(mockMetricsService.activeBackends.set).toHaveBeenCalledWith(1);
    });

    it('should support multiple backend connections', () => {
      // Arrange
      const backends = ['production', 'staging', 'development'];

      // Act
      backends.forEach((id) => {
        service.addConnection(id, createMockResponse());
      });

      // Assert
      expect(service.getActiveBackendCount()).toBe(3);
      backends.forEach((id) => {
        expect(service.isBackendConnected(id)).toBe(true);
      });
    });

    it('should replace existing connection with same backendId', () => {
      // Arrange
      const backendId = 'production';
      const firstResponse = createMockResponse();
      const secondResponse = createMockResponse();

      // Act
      service.addConnection(backendId, firstResponse);
      service.addConnection(backendId, secondResponse);

      // Assert
      expect(service.getActiveBackendCount()).toBe(1);
      expect(service.isBackendConnected(backendId)).toBe(true);
    });
  });

  describe('removeConnection', () => {
    it('should remove a backend connection', () => {
      // Arrange
      const backendId = 'production';
      const mockResponse = createMockResponse();
      service.addConnection(backendId, mockResponse);

      // Act
      service.removeConnection(backendId);

      // Assert
      expect(service.getActiveBackendCount()).toBe(0);
      expect(service.isBackendConnected(backendId)).toBe(false);
    });

    it('should update metrics when connection is removed', () => {
      // Arrange
      const backendId = 'production';
      const mockResponse = createMockResponse();
      service.addConnection(backendId, mockResponse);
      mockMetricsService.sseClientsConnected.set.mockClear();
      mockMetricsService.activeBackends.set.mockClear();

      // Act
      service.removeConnection(backendId);

      // Assert
      expect(mockMetricsService.sseClientsConnected.set).toHaveBeenCalledWith(
        0,
      );
      expect(mockMetricsService.activeBackends.set).toHaveBeenCalledWith(0);
    });

    it('should close response stream when removing connection', () => {
      // Arrange
      const backendId = 'production';
      const mockResponse = createMockResponse();
      service.addConnection(backendId, mockResponse);

      // Act
      service.removeConnection(backendId);

      // Assert
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should handle removal of non-existent backend gracefully', () => {
      // Act & Assert - should not throw
      expect(() => service.removeConnection('non-existent')).not.toThrow();
    });

    it('should not close already-ended response stream', () => {
      // Arrange
      const backendId = 'production';
      const mockResponse = createMockResponse();
      mockResponse.writableEnded = true;
      service.addConnection(backendId, mockResponse);

      // Act
      service.removeConnection(backendId);

      // Assert
      expect(mockResponse.end).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should broadcast event to all connected backends', async () => {
      // Arrange
      const backends = ['production', 'staging'];
      const responses = backends.map((id) => {
        const response = createMockResponse();
        service.addConnection(id, response);
        return response;
      });

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        content: 'test message',
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);

      // Assert
      responses.forEach((response) => {
        expect(response.write).toHaveBeenCalledWith(
          expect.stringContaining('event: message:telegram'),
        );
        expect(response.write).toHaveBeenCalledWith(
          expect.stringContaining(JSON.stringify(event)),
        );
      });
    });

    it('should increment metrics after successful broadcast', async () => {
      // Arrange
      service.addConnection('production', createMockResponse());
      service.addConnection('staging', createMockResponse());

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);

      // Assert - should increment by 2 (one for each backend)
      expect(
        mockMetricsService.messagesBroadcastTotal.inc,
      ).toHaveBeenCalledWith(2);
    });

    it('should increment per-backend broadcast metrics', async () => {
      // Arrange
      service.addConnection('production', createMockResponse());
      service.addConnection('staging', createMockResponse());

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);

      // Assert - should increment broadcast_total for each backend
      expect(mockMetricsService.broadcastTotal.inc).toHaveBeenCalledWith({
        backend_id: 'production',
      });
      expect(mockMetricsService.broadcastTotal.inc).toHaveBeenCalledWith({
        backend_id: 'staging',
      });
      expect(mockMetricsService.broadcastTotal.inc).toHaveBeenCalledTimes(2);
    });

    it('should continue broadcasting when one backend fails', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();

      // Make production throw an error
      productionResponse.write.mockImplementation(() => {
        throw new Error('Network error');
      });

      service.addConnection('production', productionResponse);
      service.addConnection('staging', stagingResponse);

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);

      // Assert - staging should still receive the event
      expect(stagingResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: message:telegram'),
      );

      // Production should be disconnected
      expect(service.isBackendConnected('production')).toBe(false);
      expect(service.isBackendConnected('staging')).toBe(true);
    });

    it('should increment failure metrics when backend write fails', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Network error');
      });

      service.addConnection('production', productionResponse);

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);

      // Assert - should increment broadcast_failures metric
      expect(mockMetricsService.broadcastFailures.inc).toHaveBeenCalledWith({
        backend_id: 'production',
        reason: 'send_error',
      });
    });

    it('should increment failure metrics when connection is closed', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.writableEnded = true; // Simulate closed connection

      service.addConnection('production', productionResponse);

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);

      // Assert - should increment broadcast_failures metric
      expect(mockMetricsService.broadcastFailures.inc).toHaveBeenCalledWith({
        backend_id: 'production',
        reason: 'connection_closed',
      });
    });

    it('should remove backends with ended response streams', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.writableEnded = true; // Simulate closed connection

      const stagingResponse = createMockResponse();

      service.addConnection('production', productionResponse);
      service.addConnection('staging', stagingResponse);

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);

      // Assert
      expect(service.isBackendConnected('production')).toBe(false);
      expect(service.isBackendConnected('staging')).toBe(true);
      expect(stagingResponse.write).toHaveBeenCalled();
    });

    it('should handle broadcast to zero backends gracefully', async () => {
      // Arrange
      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act & Assert - should not throw
      await expect(service.broadcast(event)).resolves.not.toThrow();
    });

    it('should format SSE event correctly', async () => {
      // Arrange
      const mockResponse = createMockResponse();
      service.addConnection('production', mockResponse);

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: 1234567890,
        channelId: 'channel1',
        messageId: 456,
        content: 'test',
        publishedAt: 1234567890,
      };

      // Act
      await service.broadcast(event);

      // Assert
      const expectedPayload = `event: message:telegram\ndata: ${JSON.stringify(event)}\n\n`;
      expect(mockResponse.write).toHaveBeenCalledWith(expectedPayload);
    });

    it('should handle broadcast with optional fields', async () => {
      // Arrange
      const mockResponse = createMockResponse();
      service.addConnection('production', mockResponse);

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
        title: 'Test Title',
        mediaPath: '/path/to/media.jpg',
        customField: 'custom value', // Additional field
      };

      // Act
      await service.broadcast(event);

      // Assert
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('"title":"Test Title"'),
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('"mediaPath":"/path/to/media.jpg"'),
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('"customField":"custom value"'),
      );
    });
  });

  describe('getActiveBackendCount', () => {
    it('should return 0 when no backends are connected', () => {
      expect(service.getActiveBackendCount()).toBe(0);
    });

    it('should return correct count of connected backends', () => {
      service.addConnection('production', createMockResponse());
      service.addConnection('staging', createMockResponse());
      service.addConnection('development', createMockResponse());

      expect(service.getActiveBackendCount()).toBe(3);
    });

    it('should update count after removal', () => {
      service.addConnection('production', createMockResponse());
      service.addConnection('staging', createMockResponse());
      expect(service.getActiveBackendCount()).toBe(2);

      service.removeConnection('production');
      expect(service.getActiveBackendCount()).toBe(1);
    });
  });

  describe('isBackendConnected', () => {
    it('should return false for non-existent backend', () => {
      expect(service.isBackendConnected('production')).toBe(false);
    });

    it('should return true for connected backend', () => {
      service.addConnection('production', createMockResponse());
      expect(service.isBackendConnected('production')).toBe(true);
    });

    it('should return false after backend is disconnected', () => {
      service.addConnection('production', createMockResponse());
      service.removeConnection('production');
      expect(service.isBackendConnected('production')).toBe(false);
    });
  });
});

/**
 * Helper function to create a mock ServerResponse
 */
function createMockResponse(): jest.Mocked<ServerResponse> {
  return {
    write: jest.fn(),
    end: jest.fn(),
    writableEnded: false,
  } as unknown as jest.Mocked<ServerResponse>;
}
