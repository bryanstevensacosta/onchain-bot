import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * E2E tests for Prometheus metrics endpoint
 * 
 * Per Requirement 9.5: Verify /metrics endpoint exposure
 */
describe('MetricsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/metrics (GET)', () => {
    it('should return 200 OK', () => {
      return request(app.getHttpServer())
        .get('/metrics')
        .expect(200);
    });

    it('should return text/plain content type', () => {
      return request(app.getHttpServer())
        .get('/metrics')
        .expect('Content-Type', /text\/plain/);
    });

    it('should return Prometheus format metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      const body = response.text;

      // Should contain metric names
      expect(body).toContain('ingestion_mtproto_connected');
      expect(body).toContain('ingestion_messages_received_total');
      expect(body).toContain('ingestion_messages_broadcast_total');
      expect(body).toContain('ingestion_messages_broadcast_duration_seconds');
      expect(body).toContain('ingestion_sse_clients_connected');
      expect(body).toContain('ingestion_flood_wait_count_24h');
      expect(body).toContain('ingestion_media_downloads_total');
      expect(body).toContain('ingestion_api_request_duration_seconds');

      // Should contain Prometheus format elements
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });

    it('should include default Node.js metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      const body = response.text;

      // Default metrics from PrometheusModule
      expect(body).toContain('process_cpu_');
      expect(body).toContain('nodejs_');
    });
  });
});
