import { Test, TestingModule } from '@nestjs/testing';
import { ServerResponse } from 'http';
import { SSEBroadcastService, BroadcastEvent } from '../sse-broadcast.service';
import {
  BackendCircuitBreakerService,
  CircuitState,
  CircuitOpenError,
} from '../backend-circuit-breaker.service';
import { MetricsService } from '../../../../metrics/metrics.service';

/**
 * Integration tests for SSE Broadcast + Circuit Breaker
 *
 * These tests verify the interaction between SSEBroadcastService and
 * BackendCircuitBreakerService. Unlike unit tests (which mock dependencies),
 * integration tests use real instances of both services to test the full flow.
 *
 * **Validates: Requirements 4.3, 6.2, 6.3**
 * - Requirement 4.3: Broadcast to multiple backends with resilience
 * - Requirement 6.2: Fail fast after 3 consecutive failures (circuit breaker)
 * - Requirement 6.3: Auto-recovery after timeout (half-open → closed)
 *
 * Test scenarios:
 * 1. Broadcast event to 2 connected backends (both receive)
 * 2. Backend disconnects, other continues receiving
 * 3. Circuit breaker opens after 3 failures
 * 4. Circuit breaker prevents broadcasts while open
 * 5. Circuit breaker half-opens after timeout
 * 6. Multiple backends with independent circuit states
 * 7. Successful recovery closes circuit
 * 8. Failed recovery reopens circuit
 */
describe('SSE Broadcast Integration', () => {
  let broadcastService: SSEBroadcastService;
  let circuitBreaker: BackendCircuitBreakerService;
  let mockMetricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    // Create mock MetricsService
    mockMetricsService = {
      sseClientsConnected: {
        set: jest.fn(),
      },
      activeBackends: {
        set: jest.fn(),
      },
      messagesBroadcastTotal: {
        inc: jest.fn(),
      },
      broadcastFailures: {
        inc: jest.fn(),
      },
      broadcastTotal: {
        inc: jest.fn(),
      },
    } as unknown as jest.Mocked<MetricsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SSEBroadcastService,
        BackendCircuitBreakerService,
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    broadcastService = module.get<SSEBroadcastService>(SSEBroadcastService);
    circuitBreaker = module.get<BackendCircuitBreakerService>(
      BackendCircuitBreakerService,
    );
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('Scenario 1: Broadcast to 2 connected backends (both receive)', () => {
    it('should broadcast event to both production and staging backends', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);

      const event: BroadcastEvent = {
        eventId: 'evt-001',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 123,
        content: 'Test broadcast to multiple backends',
        publishedAt: Date.now(),
      };

      // Act - Broadcast with circuit breaker protection
      await circuitBreaker.execute('production', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'production',
          productionResponse,
          event,
        );
      });

      await circuitBreaker.execute('staging', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'staging',
          stagingResponse,
          event,
        );
      });

      // Assert - Both backends received the event
      expect(productionResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('message:telegram'),
      );
      expect(productionResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(event.eventId),
      );

      expect(stagingResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('message:telegram'),
      );
      expect(stagingResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(event.eventId),
      );

      // Both circuits should be CLOSED
      expect(circuitBreaker.getState('production')).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getState('staging')).toBe(CircuitState.CLOSED);
    });

    it('should broadcast 5 consecutive events to both backends', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);

      // Act - Broadcast 5 events
      for (let i = 0; i < 5; i++) {
        const event: BroadcastEvent = {
          eventId: `evt-${i}`,
          timestamp: Date.now(),
          channelId: '-1001234567890',
          messageId: 100 + i,
          content: `Message ${i}`,
          publishedAt: Date.now(),
        };

        await circuitBreaker.execute('production', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'production',
            productionResponse,
            event,
          );
        });

        await circuitBreaker.execute('staging', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'staging',
            stagingResponse,
            event,
          );
        });
      }

      // Assert
      expect(productionResponse.write).toHaveBeenCalledTimes(5);
      expect(stagingResponse.write).toHaveBeenCalledTimes(5);
      expect(circuitBreaker.getState('production')).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getState('staging')).toBe(CircuitState.CLOSED);
    });
  });

  describe('Scenario 2: Backend disconnects, other continues receiving', () => {
    it('should remove failed backend but continue broadcasting to healthy one', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);

      const event: BroadcastEvent = {
        eventId: 'evt-disconnect',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 456,
        content: 'Test disconnect scenario',
        publishedAt: Date.now(),
      };

      // Simulate production connection failure
      productionResponse.write.mockImplementation(() => {
        throw new Error('Connection reset');
      });

      // Act - Attempt broadcast
      try {
        await circuitBreaker.execute('production', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'production',
            productionResponse,
            event,
          );
        });
      } catch (error) {
        // Expected to fail
      }

      // Staging should succeed
      await circuitBreaker.execute('staging', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'staging',
          stagingResponse,
          event,
        );
      });

      // Assert - Staging continues working
      expect(stagingResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('message:telegram'),
      );
      expect(stagingResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(event.eventId),
      );

      // Production circuit recorded failure
      const stats = circuitBreaker.getCircuitStats();
      expect(stats.get('production')?.failureCount).toBeGreaterThan(0);
      expect(circuitBreaker.getState('staging')).toBe(CircuitState.CLOSED);
    });

    it('should handle one backend with ended stream while other remains active', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);

      // Mark production stream as ended
      productionResponse.writableEnded = true;

      const event: BroadcastEvent = {
        eventId: 'evt-ended-stream',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 789,
        publishedAt: Date.now(),
      };

      // Act - Use broadcast service directly (simulates detection in broadcast loop)
      await broadcastService.broadcast(event);

      // Assert - Production should be removed, staging still connected
      expect(broadcastService.isBackendConnected('production')).toBe(false);
      expect(broadcastService.isBackendConnected('staging')).toBe(true);
      expect(stagingResponse.write).toHaveBeenCalled();
    });
  });

  describe('Scenario 3: Circuit breaker opens after 3 failures', () => {
    it('should open circuit after 3 consecutive broadcast failures', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Network timeout');
      });

      broadcastService.addConnection('production', productionResponse);

      const event: BroadcastEvent = {
        eventId: 'evt-fail',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 999,
        publishedAt: Date.now(),
      };

      // Act - Attempt 3 broadcasts
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              event,
            );
          });
        } catch (error) {
          // Expected failures
        }
      }

      // Assert - Circuit should be OPEN
      expect(circuitBreaker.getState('production')).toBe(CircuitState.OPEN);

      const stats = circuitBreaker.getCircuitStats();
      expect(stats.get('production')?.failureCount).toBe(3);
      expect(stats.get('production')?.openedAt).not.toBeNull();
    });

    it('should track failures independently for each backend', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();
      const devResponse = createMockResponse();

      productionResponse.write.mockImplementation(() => {
        throw new Error('Production failure');
      });

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);
      broadcastService.addConnection('development', devResponse);

      const event: BroadcastEvent = {
        eventId: 'evt-independent',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 111,
        publishedAt: Date.now(),
      };

      // Act - Production fails 3 times, staging and dev succeed
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              event,
            );
          });
        } catch (error) {
          // Expected
        }

        await circuitBreaker.execute('staging', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'staging',
            stagingResponse,
            event,
          );
        });

        await circuitBreaker.execute('development', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'development',
            devResponse,
            event,
          );
        });
      }

      // Assert - Only production circuit is OPEN
      expect(circuitBreaker.getState('production')).toBe(CircuitState.OPEN);
      expect(circuitBreaker.getState('staging')).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getState('development')).toBe(CircuitState.CLOSED);
    });
  });

  describe('Scenario 4: Circuit breaker prevents broadcasts while open', () => {
    it('should fail fast when circuit is OPEN without calling backend', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Network error');
      });

      broadcastService.addConnection('production', productionResponse);

      // Open the circuit by failing 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-open-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 200 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState('production')).toBe(CircuitState.OPEN);

      // Reset mock to verify it's not called
      productionResponse.write.mockClear();

      // Act - Attempt broadcast with OPEN circuit
      const event: BroadcastEvent = {
        eventId: 'evt-blocked',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 300,
        publishedAt: Date.now(),
      };

      await expect(
        circuitBreaker.execute('production', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'production',
            productionResponse,
            event,
          );
        }),
      ).rejects.toThrow(CircuitOpenError);

      // Assert - Backend write was never called (fail fast)
      expect(productionResponse.write).not.toHaveBeenCalled();
    });

    it('should continue serving healthy backends while one has OPEN circuit', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();

      productionResponse.write.mockImplementation(() => {
        throw new Error('Production down');
      });

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);

      // Open production circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 400 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      productionResponse.write.mockClear();

      // Act - Broadcast to both backends
      const event: BroadcastEvent = {
        eventId: 'evt-mixed',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 500,
        content: 'Mixed state broadcast',
        publishedAt: Date.now(),
      };

      try {
        await circuitBreaker.execute('production', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'production',
            productionResponse,
            event,
          );
        });
      } catch (error) {
        // Expected CircuitOpenError
      }

      await circuitBreaker.execute('staging', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'staging',
          stagingResponse,
          event,
        );
      });

      // Assert - Production blocked, staging succeeded
      expect(productionResponse.write).not.toHaveBeenCalled();
      expect(stagingResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(event.eventId),
      );
    });
  });

  describe('Scenario 5: Circuit breaker half-opens after timeout', () => {
    it('should transition to HALF_OPEN after 5 minutes and allow test request', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Initial failure');
      });

      broadcastService.addConnection('production', productionResponse);

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 600 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState('production')).toBe(CircuitState.OPEN);

      // Act - Wait 5 minutes
      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Assert - Circuit should be HALF_OPEN
      expect(circuitBreaker.getState('production')).toBe(
        CircuitState.HALF_OPEN,
      );

      // Fix the backend and attempt a request
      productionResponse.write.mockClear();
      productionResponse.write.mockImplementation(() => {
        // Success
      });

      const event: BroadcastEvent = {
        eventId: 'evt-recovery-test',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 700,
        publishedAt: Date.now(),
      };

      await circuitBreaker.execute('production', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'production',
          productionResponse,
          event,
        );
      });

      // Assert - Request was allowed and circuit closed
      expect(productionResponse.write).toHaveBeenCalled();
      expect(circuitBreaker.getState('production')).toBe(CircuitState.CLOSED);

      jest.useRealTimers();
    });

    it('should reopen circuit if HALF_OPEN request fails', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Still failing');
      });

      broadcastService.addConnection('production', productionResponse);

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 800 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(circuitBreaker.getState('production')).toBe(
        CircuitState.HALF_OPEN,
      );

      // Act - Attempt fails in HALF_OPEN
      const event: BroadcastEvent = {
        eventId: 'evt-reopen',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 900,
        publishedAt: Date.now(),
      };

      try {
        await circuitBreaker.execute('production', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'production',
            productionResponse,
            event,
          );
        });
      } catch (error) {
        // Expected
      }

      // Assert - Circuit reopened
      expect(circuitBreaker.getState('production')).toBe(CircuitState.OPEN);

      jest.useRealTimers();
    });
  });

  describe('Scenario 6: Multiple backends with independent circuit states', () => {
    it('should manage 3 backends with different circuit states simultaneously', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();
      const devResponse = createMockResponse();

      // Production will fail
      productionResponse.write.mockImplementation(() => {
        throw new Error('Production error');
      });

      // Staging succeeds
      // Dev succeeds

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);
      broadcastService.addConnection('development', devResponse);

      // Act - Production fails 3 times, others succeed
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 1000 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }

        await circuitBreaker.execute('staging', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'staging',
            stagingResponse,
            {
              eventId: `evt-${i}`,
              timestamp: Date.now(),
              channelId: '-1001234567890',
              messageId: 1000 + i,
              publishedAt: Date.now(),
            },
          );
        });

        await circuitBreaker.execute('development', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'development',
            devResponse,
            {
              eventId: `evt-${i}`,
              timestamp: Date.now(),
              channelId: '-1001234567890',
              messageId: 1000 + i,
              publishedAt: Date.now(),
            },
          );
        });
      }

      // Assert - Different states
      expect(circuitBreaker.getState('production')).toBe(CircuitState.OPEN);
      expect(circuitBreaker.getState('staging')).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getState('development')).toBe(CircuitState.CLOSED);

      const stats = circuitBreaker.getCircuitStats();
      expect(stats.size).toBe(3);
    });

    it('should handle 5 backends with varying failure patterns', async () => {
      // Arrange
      const backends = {
        prod: createMockResponse(),
        staging: createMockResponse(),
        dev: createMockResponse(),
        qa: createMockResponse(),
        sandbox: createMockResponse(),
      };

      // Different failure patterns
      backends.prod.write.mockImplementation(() => {
        throw new Error('Prod down');
      });
      backends.staging.write.mockImplementation(() => {
        throw new Error('Staging down');
      });
      // dev, qa, sandbox succeed

      Object.entries(backends).forEach(([id, response]) => {
        broadcastService.addConnection(id, response);
      });

      const event: BroadcastEvent = {
        eventId: 'evt-multi',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 1100,
        publishedAt: Date.now(),
      };

      // Act - Broadcast to all 5 backends, 3 times each
      for (let i = 0; i < 3; i++) {
        for (const id of Object.keys(backends)) {
          try {
            await circuitBreaker.execute(id, async () => {
              await broadcastToSingleBackend(
                broadcastService,
                id,
                backends[id as keyof typeof backends],
                event,
              );
            });
          } catch (error) {
            // Expected for prod and staging
          }
        }
      }

      // Assert
      expect(circuitBreaker.getState('prod')).toBe(CircuitState.OPEN);
      expect(circuitBreaker.getState('staging')).toBe(CircuitState.OPEN);
      expect(circuitBreaker.getState('dev')).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getState('qa')).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getState('sandbox')).toBe(CircuitState.CLOSED);
    });
  });

  describe('Scenario 7: Successful recovery closes circuit', () => {
    it('should fully recover circuit after successful broadcast in HALF_OPEN state', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Temporary failure');
      });

      broadcastService.addConnection('production', productionResponse);

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 1200 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      // Wait for HALF_OPEN
      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(circuitBreaker.getState('production')).toBe(
        CircuitState.HALF_OPEN,
      );

      // Fix backend
      productionResponse.write.mockClear();
      productionResponse.write.mockImplementation(() => {
        // Success
      });

      // Act - Successful recovery broadcast
      const event: BroadcastEvent = {
        eventId: 'evt-recovery',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 1300,
        publishedAt: Date.now(),
      };

      await circuitBreaker.execute('production', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'production',
          productionResponse,
          event,
        );
      });

      // Assert - Circuit fully recovered
      expect(circuitBreaker.getState('production')).toBe(CircuitState.CLOSED);

      // Subsequent broadcasts should work
      const event2: BroadcastEvent = {
        eventId: 'evt-post-recovery',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 1301,
        publishedAt: Date.now(),
      };

      await circuitBreaker.execute('production', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'production',
          productionResponse,
          event2,
        );
      });

      expect(productionResponse.write).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should reset failure count after successful recovery', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Initial failures');
      });

      broadcastService.addConnection('production', productionResponse);

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 1400 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Fix and recover
      productionResponse.write.mockClear();
      productionResponse.write.mockImplementation(() => {
        // Success
      });

      await circuitBreaker.execute('production', async () => {
        await broadcastToSingleBackend(
          broadcastService,
          'production',
          productionResponse,
          {
            eventId: 'evt-recovery',
            timestamp: Date.now(),
            channelId: '-1001234567890',
            messageId: 1500,
            publishedAt: Date.now(),
          },
        );
      });

      jest.useRealTimers();

      // Act - Introduce 2 new failures
      productionResponse.write.mockImplementation(() => {
        throw new Error('New failures');
      });

      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-new-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 1600 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      // Assert - Should still be CLOSED (failure count was reset)
      expect(circuitBreaker.getState('production')).toBe(CircuitState.CLOSED);
    });
  });

  describe('Scenario 8: Failed recovery reopens circuit', () => {
    it('should reopen circuit and start new recovery timeout after failed HALF_OPEN attempt', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      productionResponse.write.mockImplementation(() => {
        throw new Error('Persistent failure');
      });

      broadcastService.addConnection('production', productionResponse);

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 1700 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // Expected
        }
      }

      jest.useFakeTimers();

      // First recovery attempt - HALF_OPEN
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(circuitBreaker.getState('production')).toBe(
        CircuitState.HALF_OPEN,
      );

      // Act - Failed recovery attempt
      try {
        await circuitBreaker.execute('production', async () => {
          await broadcastToSingleBackend(
            broadcastService,
            'production',
            productionResponse,
            {
              eventId: 'evt-failed-recovery',
              timestamp: Date.now(),
              channelId: '-1001234567890',
              messageId: 1800,
              publishedAt: Date.now(),
            },
          );
        });
      } catch (error) {
        // Expected
      }

      // Assert - Circuit reopened
      expect(circuitBreaker.getState('production')).toBe(CircuitState.OPEN);

      // Second recovery attempt - wait another 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(circuitBreaker.getState('production')).toBe(
        CircuitState.HALF_OPEN,
      );

      jest.useRealTimers();
    });
  });

  describe('Edge cases and stress scenarios', () => {
    it('should handle rapid broadcast bursts without losing messages', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      const stagingResponse = createMockResponse();

      broadcastService.addConnection('production', productionResponse);
      broadcastService.addConnection('staging', stagingResponse);

      // Act - Rapid fire 20 events
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 20; i++) {
        const event: BroadcastEvent = {
          eventId: `evt-burst-${i}`,
          timestamp: Date.now(),
          channelId: '-1001234567890',
          messageId: 2000 + i,
          publishedAt: Date.now(),
        };

        promises.push(
          circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              event,
            );
          }),
        );

        promises.push(
          circuitBreaker.execute('staging', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'staging',
              stagingResponse,
              event,
            );
          }),
        );
      }

      await Promise.all(promises);

      // Assert - All messages delivered
      expect(productionResponse.write).toHaveBeenCalledTimes(20);
      expect(stagingResponse.write).toHaveBeenCalledTimes(20);
    });

    it('should handle backend recovering mid-broadcast sequence', async () => {
      // Arrange
      const productionResponse = createMockResponse();
      let failureCount = 0;

      productionResponse.write.mockImplementation(() => {
        failureCount++;
        if (failureCount <= 2) {
          throw new Error('Transient failure');
        }
        // Succeeds after 2 failures
      });

      broadcastService.addConnection('production', productionResponse);

      // Act - Broadcast 5 events (first 2 fail, next 3 succeed)
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute('production', async () => {
            await broadcastToSingleBackend(
              broadcastService,
              'production',
              productionResponse,
              {
                eventId: `evt-${i}`,
                timestamp: Date.now(),
                channelId: '-1001234567890',
                messageId: 2100 + i,
                publishedAt: Date.now(),
              },
            );
          });
        } catch (error) {
          // First 2 expected to fail
        }
      }

      // Assert - Circuit never opened (only 2 failures, then recovered)
      expect(circuitBreaker.getState('production')).toBe(CircuitState.CLOSED);
      expect(productionResponse.write).toHaveBeenCalledTimes(5);
    });

    it('should handle broadcast with empty backend list', async () => {
      // Arrange - No backends connected
      const event: BroadcastEvent = {
        eventId: 'evt-empty',
        timestamp: Date.now(),
        channelId: '-1001234567890',
        messageId: 2200,
        publishedAt: Date.now(),
      };

      // Act & Assert - Should not throw
      await expect(broadcastService.broadcast(event)).resolves.not.toThrow();
    });
  });
});

/**
 * Helper function to broadcast to a single backend
 * Simulates the real broadcast flow with circuit breaker protection
 */
async function broadcastToSingleBackend(
  broadcastService: SSEBroadcastService,
  backendId: string,
  response: ServerResponse,
  event: BroadcastEvent,
): Promise<void> {
  if (!broadcastService.isBackendConnected(backendId)) {
    throw new Error(`Backend ${backendId} not connected`);
  }

  // Check if response is writable
  if (response.writableEnded) {
    throw new Error(`Backend ${backendId} connection closed`);
  }

  // Send the event
  const payload = `event: message:telegram\ndata: ${JSON.stringify(event)}\n\n`;
  response.write(payload);
}

/**
 * Helper function to create a mock ServerResponse
 */
function createMockResponse(): jest.Mocked<ServerResponse> {
  return {
    set: jest.fn().mockReturnThis(),
    write: jest.fn(),
    end: jest.fn(),
    writableEnded: false,
  } as unknown as jest.Mocked<ServerResponse>;
}
