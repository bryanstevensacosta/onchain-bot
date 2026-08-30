import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { Registry } from 'prom-client';

describe('MetricsService', () => {
  let service: MetricsService;
  let registry: Registry;

  beforeEach(async () => {
    registry = new Registry();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MetricsService,
          useFactory: () => new MetricsService(registry),
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('mtprotoConnected', () => {
    it('should initialize to 0', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_mtproto_connected 0');
    });

    it('should update when set to 1', async () => {
      service.mtprotoConnected.set(1);
      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_mtproto_connected 1');
    });
  });

  describe('messagesReceivedTotal', () => {
    it('should increment with labels', async () => {
      service.messagesReceivedTotal.inc({ channelId: 'channel1', type: 'kol' });
      service.messagesReceivedTotal.inc({ channelId: 'channel1', type: 'kol' });
      service.messagesReceivedTotal.inc({ channelId: 'channel2', type: 'news' });

      const metrics = await service.getMetrics();
      
      expect(metrics).toContain('ingestion_messages_received_total');
      expect(metrics).toContain('channelId="channel1"');
      expect(metrics).toContain('type="kol"');
      expect(metrics).toContain('channelId="channel2"');
      expect(metrics).toContain('type="news"');
    });
  });

  describe('messagesBroadcastTotal', () => {
    it('should increment without labels', async () => {
      service.messagesBroadcastTotal.inc();
      service.messagesBroadcastTotal.inc();
      service.messagesBroadcastTotal.inc();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_messages_broadcast_total');
    });
  });

  describe('messagesBroadcastDuration', () => {
    it('should record observations', async () => {
      service.messagesBroadcastDuration.observe(0.05);
      service.messagesBroadcastDuration.observe(0.15);
      service.messagesBroadcastDuration.observe(0.25);

      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_messages_broadcast_duration_seconds');
      expect(metrics).toContain('_bucket');
      expect(metrics).toContain('_sum');
      expect(metrics).toContain('_count');
    });
  });

  describe('sseClientsConnected', () => {
    it('should initialize to 0', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_sse_clients_connected 0');
    });

    it('should update when clients connect/disconnect', async () => {
      service.sseClientsConnected.set(3);
      let metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_sse_clients_connected 3');

      service.sseClientsConnected.set(5);
      metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_sse_clients_connected 5');

      service.sseClientsConnected.set(2);
      metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_sse_clients_connected 2');
    });
  });

  describe('floodWaitCount24h', () => {
    it('should initialize to 0', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_flood_wait_count_24h 0');
    });

    it('should track FLOOD_WAIT errors', async () => {
      service.floodWaitCount24h.set(5);
      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_flood_wait_count_24h 5');
    });
  });

  describe('mediaDownloadsTotal', () => {
    it('should increment with type labels', async () => {
      service.mediaDownloadsTotal.inc({ type: 'photo' });
      service.mediaDownloadsTotal.inc({ type: 'photo' });
      service.mediaDownloadsTotal.inc({ type: 'video' });
      service.mediaDownloadsTotal.inc({ type: 'document' });

      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_media_downloads_total');
      expect(metrics).toContain('type="photo"');
      expect(metrics).toContain('type="video"');
      expect(metrics).toContain('type="document"');
    });
  });

  describe('apiRequestDuration', () => {
    it('should record observations with labels', async () => {
      service.apiRequestDuration.observe(
        { endpoint: '/api/health', method: 'GET', status: '200' },
        0.05,
      );
      service.apiRequestDuration.observe(
        { endpoint: '/api/metrics', method: 'GET', status: '200' },
        0.02,
      );
      service.apiRequestDuration.observe(
        { endpoint: '/api/stream', method: 'GET', status: '200' },
        10.5,
      );

      const metrics = await service.getMetrics();
      expect(metrics).toContain('ingestion_api_request_duration_seconds');
      expect(metrics).toContain('endpoint="/api/health"');
      expect(metrics).toContain('endpoint="/api/metrics"');
      expect(metrics).toContain('endpoint="/api/stream"');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('status="200"');
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus format string', async () => {
      const result = await service.getMetrics();
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('# HELP');
      expect(result).toContain('# TYPE');
    });

    it('should include all registered metrics', async () => {
      const result = await service.getMetrics();
      
      expect(result).toContain('ingestion_mtproto_connected');
      expect(result).toContain('ingestion_messages_received_total');
      expect(result).toContain('ingestion_messages_broadcast_total');
      expect(result).toContain('ingestion_messages_broadcast_duration_seconds');
      expect(result).toContain('ingestion_sse_clients_connected');
      expect(result).toContain('ingestion_flood_wait_count_24h');
      expect(result).toContain('ingestion_media_downloads_total');
      expect(result).toContain('ingestion_api_request_duration_seconds');
    });
  });

  describe('getContentType', () => {
    it('should return Prometheus content type', () => {
      const contentType = service.getContentType();
      expect(contentType).toContain('text/plain');
    });
  });
});
