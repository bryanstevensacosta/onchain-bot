import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BackendChannelProviderService } from '../src/telegram/shared/services/backend-channel-provider.service';
import { StreamService } from '../src/stream/application/services/stream.service';
import * as http from 'http';

/**
 * SSEStreamController E2E Tests
 *
 * Integration tests:
 * - Connect with valid/invalid backendId
 * - Heartbeat received within 30s
 * - Disconnect cleanup
 *
 * Per Requirements 2.1, 2.2, 2.3, 4.3, 6.4
 */
describe('SSEStreamController (e2e)', () => {
  let app: INestApplication;
  let channelProvider: BackendChannelProviderService;
  let streamService: StreamService;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get services
    channelProvider = app.get(BackendChannelProviderService);
    streamService = app.get(StreamService);

    // Get the actual port the app is listening on
    const server = app.getHttpServer();
    const address = server.address();
    const port = typeof address === 'object' ? address?.port : 3031;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Connection validation', () => {
    it('should reject connection without backendId', (done) => {
      // Per Requirement 4.3: backendId is required
      request(app.getHttpServer())
        .get('/api/ingestion/stream')
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toContain('backendId');
          done();
        });
    });

    it('should reject connection with unregistered backendId', (done) => {
      // Per Requirement 2.3: Reject with 401 if not registered
      request(app.getHttpServer())
        .get('/api/ingestion/stream?backendId=unregistered-backend')
        .expect(401)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toContain('not registered');
          done();
        });
    });

    it('should accept connection with registered backendId', (done) => {
      // Per Requirement 2.2: Validate and accept registered backends
      // Register a backend first
      channelProvider.registerBackend('test-backend', ['channel1', 'channel2']);

      // Make raw HTTP request to SSE endpoint
      const options = {
        hostname: '127.0.0.1',
        port: app.getHttpServer().address().port,
        path: '/api/ingestion/stream?backendId=test-backend',
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      };

      const req = http.request(options, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('text/event-stream');

        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();

          // Check for connection:established event
          if (data.includes('event: connection:established')) {
            req.destroy();
            done();
          }
        });

        res.on('error', (err) => {
          req.destroy();
          done.fail(`Response error: ${err.message}`);
        });
      });

      req.on('error', (err) => {
        done.fail(`Request error: ${err.message}`);
      });

      req.end();

      // Timeout
      setTimeout(() => {
        req.destroy();
        done.fail('Connection timeout');
      }, 5000);
    });
  });

  describe('Heartbeat functionality', () => {
    it('should receive heartbeat within 30 seconds', (done) => {
      // Per Requirement 6.4: Heartbeat every 30 seconds
      channelProvider.registerBackend('heartbeat-test', ['channel1']);

      const options = {
        hostname: '127.0.0.1',
        port: app.getHttpServer().address().port,
        path: '/api/ingestion/stream?backendId=heartbeat-test',
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      };

      const req = http.request(options, (res) => {
        expect(res.statusCode).toBe(200);

        let connectionEstablished = false;
        let heartbeatReceived = false;

        res.on('data', (chunk) => {
          const data = chunk.toString();

          if (data.includes('event: connection:established')) {
            connectionEstablished = true;
          }

          if (data.includes('event: health:ping')) {
            heartbeatReceived = true;
            expect(data).toContain('timestamp');
            expect(data).toContain('uptime');
            expect(data).toContain('connectedClients');
            req.destroy();
            done();
          }
        });
      });

      req.on('error', (err) => {
        if (err.message !== 'socket hang up') {
          done.fail(`Request error: ${err.message}`);
        }
      });

      req.end();

      // Manually trigger heartbeat for faster testing
      setTimeout(() => {
        streamService.sendHeartbeat();
      }, 1000);

      // Timeout after 35 seconds
      setTimeout(() => {
        req.destroy();
        done.fail('Heartbeat not received within timeout');
      }, 35000);
    }, 40000);
  });

  describe('Disconnect cleanup', () => {
    it('should clean up connection on client disconnect', (done) => {
      channelProvider.registerBackend('disconnect-test', ['channel1']);

      const initialClientCount = streamService.getClientCount();

      const options = {
        hostname: '127.0.0.1',
        port: app.getHttpServer().address().port,
        path: '/api/ingestion/stream?backendId=disconnect-test',
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      };

      const req = http.request(options, (res) => {
        res.on('data', (chunk) => {
          const data = chunk.toString();

          if (data.includes('event: connection:established')) {
            // Verify client was added
            const connectedCount = streamService.getClientCount();
            expect(connectedCount).toBe(initialClientCount + 1);

            // Close the connection
            req.destroy();

            // Wait for cleanup
            setTimeout(() => {
              const finalCount = streamService.getClientCount();
              expect(finalCount).toBe(initialClientCount);
              done();
            }, 500);
          }
        });
      });

      req.on('error', (err) => {
        // Ignore socket hang up error from destroy()
        if (err.message !== 'socket hang up') {
          done.fail(`Request error: ${err.message}`);
        }
      });

      req.end();

      setTimeout(() => {
        req.destroy();
        done.fail('Test timeout');
      }, 5000);
    });
  });

  describe('Multiple connections', () => {
    it('should handle multiple connections from same backend', (done) => {
      channelProvider.registerBackend('multi-conn-test', ['channel1']);

      const eventSource1 = new EventSource(
        `${baseUrl}/api/ingestion/stream?backendId=multi-conn-test`,
      );
      const eventSource2 = new EventSource(
        `${baseUrl}/api/ingestion/stream?backendId=multi-conn-test`,
      );

      let conn1Established = false;
      let conn2Established = false;

      eventSource1.addEventListener('connection:established', () => {
        conn1Established = true;
        checkBothConnected();
      });

      eventSource2.addEventListener('connection:established', () => {
        conn2Established = true;
        checkBothConnected();
      });

      function checkBothConnected() {
        if (conn1Established && conn2Established) {
          const clientCount = streamService.getClientCount();
          expect(clientCount).toBeGreaterThanOrEqual(2);

          eventSource1.close();
          eventSource2.close();
          done();
        }
      }

      eventSource1.onerror = eventSource2.onerror = (error: any) => {
        eventSource1.close();
        eventSource2.close();
        done.fail(`Connection error: ${error}`);
      };

      // Timeout
      setTimeout(() => {
        eventSource1.close();
        eventSource2.close();
        done.fail(
          `Test timeout. conn1: ${conn1Established}, conn2: ${conn2Established}`,
        );
      }, 5000);
    });

    it('should handle connections from multiple different backends', (done) => {
      channelProvider.registerBackend('backend-a', ['channel1']);
      channelProvider.registerBackend('backend-b', ['channel2']);

      const eventSourceA = new EventSource(
        `${baseUrl}/api/ingestion/stream?backendId=backend-a`,
      );
      const eventSourceB = new EventSource(
        `${baseUrl}/api/ingestion/stream?backendId=backend-b`,
      );

      let connAEstablished = false;
      let connBEstablished = false;

      eventSourceA.addEventListener('connection:established', () => {
        connAEstablished = true;
        checkBothConnected();
      });

      eventSourceB.addEventListener('connection:established', () => {
        connBEstablished = true;
        checkBothConnected();
      });

      function checkBothConnected() {
        if (connAEstablished && connBEstablished) {
          const clientCount = streamService.getClientCount();
          expect(clientCount).toBeGreaterThanOrEqual(2);

          eventSourceA.close();
          eventSourceB.close();
          done();
        }
      }

      eventSourceA.onerror = eventSourceB.onerror = (error: any) => {
        eventSourceA.close();
        eventSourceB.close();
        done.fail(`Connection error: ${error}`);
      };

      // Timeout
      setTimeout(() => {
        eventSourceA.close();
        eventSourceB.close();
        done.fail(
          `Test timeout. A: ${connAEstablished}, B: ${connBEstablished}`,
        );
      }, 5000);
    });
  });
});
