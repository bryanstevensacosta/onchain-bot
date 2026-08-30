import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from '../../metrics.service';
import { Registry } from 'prom-client';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: MetricsService,
          useFactory: () => {
            const registry = new Registry();
            return new MetricsService(registry);
          },
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMetrics', () => {
    it('should return Prometheus format metrics', async () => {
      const result = await controller.getMetrics();

      // Should contain metric names
      expect(result).toContain('ingestion_mtproto_connected');
      expect(result).toContain('ingestion_messages_received_total');
      expect(result).toContain('ingestion_messages_broadcast_total');
      expect(result).toContain('ingestion_messages_broadcast_duration_seconds');
      expect(result).toContain('ingestion_sse_clients_connected');
      expect(result).toContain('ingestion_flood_wait_count_24h');
      expect(result).toContain('ingestion_media_downloads_total');
      expect(result).toContain('ingestion_api_request_duration_seconds');
    });

    it('should return metrics in text/plain format', async () => {
      const result = await controller.getMetrics();

      // Should be plain text with newlines
      expect(typeof result).toBe('string');
      expect(result.includes('\n')).toBe(true);
    });

    it('should include HELP and TYPE declarations', async () => {
      const result = await controller.getMetrics();

      // Prometheus format includes HELP and TYPE
      expect(result).toContain('# HELP');
      expect(result).toContain('# TYPE');
    });

    it('should reflect updated metric values', async () => {
      // Update a metric
      metricsService.mtprotoConnected.set(1);
      metricsService.sseClientsConnected.set(5);
      metricsService.messagesReceivedTotal.inc({
        channelId: 'test',
        type: 'kol',
      });

      const result = await controller.getMetrics();

      // Should contain updated values
      expect(result).toContain('ingestion_mtproto_connected 1');
      expect(result).toContain('ingestion_sse_clients_connected 5');
      expect(result).toContain('ingestion_messages_received_total');
    });
  });
});
