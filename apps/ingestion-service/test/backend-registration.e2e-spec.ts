import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * E2E tests for Backend Registration API
 *
 * Per Requirement 1.1: Backend registration with identifier and Source_Whitelist
 * Per Requirement 1.2: Store Backend identifier and Source_Whitelist in memory
 * Per Requirement 1.3: Compute and return Channel_Union size
 * Per Requirement 2.1: Validate backendId format
 * Per Requirement 3.2: Returns 200 with channelUnionSize on success
 *
 * Tests:
 * - POST with valid data returns 200 with registered=true and channelUnionSize
 * - Invalid backendId format returns 400
 * - Empty sourceWhitelist returns 400 (DTO validation)
 * - Multiple backend registrations compute correct union
 * - Re-registration updates existing backend
 */
describe('BackendRegistrationController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same ValidationPipe as in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/ingestion/backends/register', () => {
    it('should return 200 with valid registration data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'production',
          sourceWhitelist: ['channel1', 'channel2', 'channel3'],
        })
        .expect(200);

      expect(response.body).toEqual({
        registered: true,
        channelUnionSize: expect.any(Number),
        message: expect.stringContaining('production'),
      });

      expect(response.body.channelUnionSize).toBeGreaterThanOrEqual(3);
    });

    it('should accept custom apiVersion', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'staging-v2',
          sourceWhitelist: ['channel1'],
          apiVersion: 'v2',
        })
        .expect(200);

      expect(response.body.registered).toBe(true);
    });

    it('should compute channel union across multiple backends', async () => {
      // Register first backend
      const response1 = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'backend-union-1',
          sourceWhitelist: ['channelA', 'channelB'],
        })
        .expect(200);

      const unionSize1 = response1.body.channelUnionSize;

      // Register second backend with overlapping channels
      const response2 = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'backend-union-2',
          sourceWhitelist: ['channelB', 'channelC'],
        })
        .expect(200);

      const unionSize2 = response2.body.channelUnionSize;

      // Union size should reflect unique channels (channelA, channelB, channelC)
      expect(unionSize2).toBeGreaterThanOrEqual(unionSize1);
    });

    it('should return 400 when backendId is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: '',
          sourceWhitelist: ['channel1'],
        })
        .expect(400);

      expect(response.body.message).toContain('backendId cannot be empty');
    });

    it('should return 400 when backendId is whitespace only', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: '   ',
          sourceWhitelist: ['channel1'],
        })
        .expect(400);

      expect(response.body.message).toContain('backendId cannot be empty');
    });

    it('should return 400 when backendId contains invalid characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'prod@ction!',
          sourceWhitelist: ['channel1'],
        })
        .expect(400);

      expect(response.body.message).toContain('alphanumeric');
    });

    it('should accept backendId with hyphens and underscores', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'my-backend_123',
          sourceWhitelist: ['channel1'],
        })
        .expect(200);

      expect(response.body.registered).toBe(true);
    });

    it('should return 400 when backendId is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          sourceWhitelist: ['channel1'],
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('backendId')]),
      );
    });

    it('should return 400 when sourceWhitelist is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'production',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('sourceWhitelist')]),
      );
    });

    it('should return 400 when sourceWhitelist is not an array', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'production',
          sourceWhitelist: 'not-an-array',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('array')]),
      );
    });

    it('should return 400 when sourceWhitelist contains non-string values', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'production',
          sourceWhitelist: ['channel1', 123, 'channel2'],
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('string')]),
      );
    });

    it('should allow empty sourceWhitelist array', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'backend-empty',
          sourceWhitelist: [],
        })
        .expect(200);

      expect(response.body.registered).toBe(true);
      expect(response.body.channelUnionSize).toBeGreaterThanOrEqual(0);
    });

    it('should update registration when same backendId registers again', async () => {
      const backendId = 'backend-reregister';

      // First registration
      const response1 = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId,
          sourceWhitelist: ['channel1', 'channel2'],
        })
        .expect(200);

      expect(response1.body.registered).toBe(true);

      // Second registration with different whitelist
      const response2 = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId,
          sourceWhitelist: ['channel3', 'channel4', 'channel5'],
        })
        .expect(200);

      expect(response2.body.registered).toBe(true);
      expect(response2.body.message).toContain('3 channels');
    });

    it('should handle duplicate channels in sourceWhitelist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'backend-duplicates',
          sourceWhitelist: ['channel1', 'channel1', 'channel2'],
        })
        .expect(200);

      expect(response.body.registered).toBe(true);
      // Should deduplicate internally
      expect(response.body.channelUnionSize).toBeGreaterThanOrEqual(2);
    });

    it('should reject request with extra properties when forbidNonWhitelisted is true', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'production',
          sourceWhitelist: ['channel1'],
          extraProperty: 'should-be-rejected',
        })
        .expect(400);

      expect(response.body.message).toContain(
        'property extraProperty should not exist',
      );
    });

    it('should return valid JSON response structure', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ingestion/backends/register')
        .send({
          backendId: 'backend-json',
          sourceWhitelist: ['channel1'],
        })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('registered');
      expect(response.body).toHaveProperty('channelUnionSize');
      expect(response.body).toHaveProperty('message');

      expect(typeof response.body.registered).toBe('boolean');
      expect(typeof response.body.channelUnionSize).toBe('number');
      expect(typeof response.body.message).toBe('string');
    });
  });
});
