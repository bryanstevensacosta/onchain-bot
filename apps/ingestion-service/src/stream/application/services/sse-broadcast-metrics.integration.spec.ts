import { Test, TestingModule } from '@nestjs/testing';
import { ServerResponse } from 'http';
import { SSEBroadcastService, BroadcastEvent } from './sse-broadcast.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { Registry } from 'prom-client';

/**
 * Integration tests for SSEBroadcastService metrics
 *
 * Per Requirement 8.1: Test ingestion_active_backends gauge
 * Per Requirement 8.3: Test ingestion_broadcast_total and ingestion_broadcast_failures counters
 * Per Task 4.2: Verify metrics are exposed at /metrics endpoint
 *
 * These tests verify that metrics are properly registered and updated
 * using a real Registry instance instead of mocks.
 */
describe('SSEBroadcastService Metrics Integration', () => {
  let service: SSEBroadcastService;
  let metricsService: MetricsService;
  let registry: Registry;

  beforeEach(async () => {
    // Create a real Registry instance
    registry = new Registry();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SSEBroadcastService,
        MetricsService,
        {
          provide: Registry,
          useValue: registry,
        },
      ],
    }).compile();

    service = module.get<SSEBroadcastService>(SSEBroadcastService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  describe('metrics endpoint', () => {
    it('should expose ingestion_active_backends metric', async () => {
      // Arrange
      service.addConnection('production', createMockResponse());
      service.addConnection('staging', createMockResponse());

      // Act
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toContain('ingestion_active_backends');
      expect(metrics).toContain('ingestion_active_backends 2');
    });

    it('should expose ingestion_broadcast_total metric with backend_id label', async () => {
      // Arrange
      service.addConnection('production', createMockResponse());

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toContain('ingestion_broadcast_total');
      expect(metrics).toContain('backend_id="production"');
    });

    it('should expose ingestion_broadcast_failures metric with labels', async () => {
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
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toContain('ingestion_broadcast_failures');
      expect(metrics).toContain('backend_id="production"');
      expect(metrics).toContain('reason="send_error"');
    });

    it('should expose ingestion_channel_union_size metric', async () => {
      // Act
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toContain('ingestion_channel_union_size');
    });

    it('should expose ingestion_backfill_buffer_size metric', async () => {
      // Act
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toContain('ingestion_backfill_buffer_size');
    });

    it('should expose ingestion_backfill_requests_total metric', async () => {
      // Act
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toContain('ingestion_backfill_requests_total');
    });
  });

  describe('broadcast_total counter', () => {
    it('should increment for each successful broadcast per backend', async () => {
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
      await service.broadcast(event);
      const metrics = await metricsService.getMetrics();

      // Assert - each backend should have count of 2
      expect(metrics).toMatch(
        /ingestion_broadcast_total\{backend_id="production"\} 2/,
      );
      expect(metrics).toMatch(
        /ingestion_broadcast_total\{backend_id="staging"\} 2/,
      );
    });

    it('should track different backends separately', async () => {
      // Arrange
      service.addConnection('production', createMockResponse());

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act - broadcast once
      await service.broadcast(event);

      // Add staging backend
      service.addConnection('staging', createMockResponse());

      // Broadcast again - production gets 2, staging gets 1
      await service.broadcast(event);

      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toMatch(
        /ingestion_broadcast_total\{backend_id="production"\} 2/,
      );
      expect(metrics).toMatch(
        /ingestion_broadcast_total\{backend_id="staging"\} 1/,
      );
    });
  });

  describe('broadcast_failures counter', () => {
    it('should track send_error failures per backend', async () => {
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
      await service.broadcast(event);
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toMatch(
        /ingestion_broadcast_failures\{backend_id="production",reason="send_error"\} 2/,
      );
    });

    it('should track connection_closed failures per backend', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.writableEnded = true;

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
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toMatch(
        /ingestion_broadcast_failures\{backend_id="production",reason="connection_closed"\} 1/,
      );
    });

    it('should track different failure reasons separately', async () => {
      // Arrange
      const prod1 = createMockResponse();
      prod1.write.mockImplementation(() => {
        throw new Error('Network error');
      });
      service.addConnection('prod1', prod1);

      const prod2 = createMockResponse();
      prod2.writableEnded = true;
      service.addConnection('prod2', prod2);

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act
      await service.broadcast(event);
      const metrics = await metricsService.getMetrics();

      // Assert
      expect(metrics).toMatch(
        /ingestion_broadcast_failures\{backend_id="prod1",reason="send_error"\} 1/,
      );
      expect(metrics).toMatch(
        /ingestion_broadcast_failures\{backend_id="prod2",reason="connection_closed"\} 1/,
      );
    });
  });

  describe('active_backends gauge', () => {
    it('should update when backends connect and disconnect', async () => {
      // Initial state
      let metrics = await metricsService.getMetrics();
      expect(metrics).toContain('ingestion_active_backends 0');

      // Add production
      service.addConnection('production', createMockResponse());
      metrics = await metricsService.getMetrics();
      expect(metrics).toContain('ingestion_active_backends 1');

      // Add staging
      service.addConnection('staging', createMockResponse());
      metrics = await metricsService.getMetrics();
      expect(metrics).toContain('ingestion_active_backends 2');

      // Remove production
      service.removeConnection('production');
      metrics = await metricsService.getMetrics();
      expect(metrics).toContain('ingestion_active_backends 1');

      // Remove staging
      service.removeConnection('staging');
      metrics = await metricsService.getMetrics();
      expect(metrics).toContain('ingestion_active_backends 0');
    });

    it('should update when backend fails during broadcast', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Network error');
      });

      service.addConnection('production', productionResponse);
      service.addConnection('staging', createMockResponse());

      let metrics = await metricsService.getMetrics();
      expect(metrics).toContain('ingestion_active_backends 2');

      const event: BroadcastEvent = {
        eventId: '123',
        timestamp: Date.now(),
        channelId: 'channel1',
        messageId: 456,
        publishedAt: Date.now(),
      };

      // Act - production should fail and be removed
      await service.broadcast(event);

      // Assert
      metrics = await metricsService.getMetrics();
      expect(metrics).toContain('ingestion_active_backends 1');
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
