import { Test, TestingModule } from '@nestjs/testing';
import {
  BackendCircuitBreakerService,
  CircuitState,
  CircuitOpenError,
} from './backend-circuit-breaker.service';

describe('BackendCircuitBreakerService', () => {
  let service: BackendCircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BackendCircuitBreakerService],
    }).compile();

    service = module.get<BackendCircuitBreakerService>(
      BackendCircuitBreakerService,
    );
  });

  afterEach(() => {
    service.reset();
  });

  describe('initial state', () => {
    it('should start with CLOSED circuit for new backend', () => {
      // Act
      const state = service.getState('backend-1');

      // Assert
      expect(state).toBe(CircuitState.CLOSED);
    });

    it('should create independent circuits for different backends', () => {
      // Act
      const state1 = service.getState('backend-1');
      const state2 = service.getState('backend-2');
      const state3 = service.getState('backend-3');

      // Assert
      expect(state1).toBe(CircuitState.CLOSED);
      expect(state2).toBe(CircuitState.CLOSED);
      expect(state3).toBe(CircuitState.CLOSED);
    });
  });

  describe('CLOSED → OPEN transition (after 3 failures)', () => {
    it('should transition to OPEN after 3 consecutive failures', () => {
      // Arrange
      const backendId = 'backend-fail';

      // Act - Record 3 failures
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      service.recordFailure(backendId);

      // Assert - Circuit should now be OPEN
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);
    });

    it('should remain CLOSED with fewer than 3 failures', () => {
      // Arrange
      const backendId = 'backend-partial-fail';

      // Act
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      // Assert - Only 2 failures, should stay CLOSED
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);
    });

    it('should track failures independently per backend', () => {
      // Act
      service.recordFailure('backend-1');
      service.recordFailure('backend-1');
      service.recordFailure('backend-2');

      // Assert
      expect(service.getState('backend-1')).toBe(CircuitState.CLOSED); // 2 failures
      expect(service.getState('backend-2')).toBe(CircuitState.CLOSED); // 1 failure

      // Act - Third failure for backend-1 only
      service.recordFailure('backend-1');

      // Assert
      expect(service.getState('backend-1')).toBe(CircuitState.OPEN);
      expect(service.getState('backend-2')).toBe(CircuitState.CLOSED);
    });
  });

  describe('OPEN → HALF_OPEN transition (after 5 minutes)', () => {
    it('should transition to HALF_OPEN after 5 minutes', async () => {
      // Arrange
      const backendId = 'backend-recovery';

      // Open the circuit
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      // Act - Wait 5 minutes (simulate by manipulating time)
      // We'll use jest fake timers
      jest.useFakeTimers();

      // Advance time by 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Assert
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      jest.useRealTimers();
    });

    it('should remain OPEN before 5 minute timeout', () => {
      // Arrange
      const backendId = 'backend-waiting';

      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      // Act - Wait less than 5 minutes
      jest.useFakeTimers();
      jest.advanceTimersByTime(4 * 60 * 1000); // 4 minutes

      // Assert - Should still be OPEN
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      jest.useRealTimers();
    });

    it('should transition exactly at 5 minute mark', () => {
      // Arrange
      const backendId = 'backend-exact';

      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      jest.useFakeTimers();

      // Act - Exactly 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Assert
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      jest.useRealTimers();
    });
  });

  describe('HALF_OPEN → CLOSED transition (on success)', () => {
    it('should transition to CLOSED on successful half-open attempt', () => {
      // Arrange - Open circuit then transition to HALF_OPEN
      const backendId = 'backend-success';

      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);
      jest.useRealTimers();

      // Act - Record success in HALF_OPEN state
      service.recordSuccess(backendId);

      // Assert
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);
    });

    it('should reset failure count on successful recovery', () => {
      // Arrange
      const backendId = 'backend-reset';

      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Check state while fake timers are active
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      // Act - Successful recovery
      service.recordSuccess(backendId);

      jest.useRealTimers();

      // Assert - Should be able to handle 2 more failures without opening
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);
    });
  });

  describe('HALF_OPEN → OPEN transition (on failure)', () => {
    it('should transition back to OPEN on failed half-open attempt', () => {
      // Arrange - Get to HALF_OPEN state
      const backendId = 'backend-reopen';

      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);
      jest.useRealTimers();

      // Act - Fail during HALF_OPEN
      service.recordFailure(backendId);

      // Assert
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);
    });

    it('should start new recovery timeout after reopening', () => {
      // Arrange
      const backendId = 'backend-retry-recovery';

      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Check HALF_OPEN state
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      service.recordFailure(backendId); // Reopen
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      // Act - Wait another 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Assert - Should be HALF_OPEN again
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      jest.useRealTimers();
    });
  });

  describe('execute() with circuit breaker logic', () => {
    it('should execute function when circuit is CLOSED', async () => {
      // Arrange
      const backendId = 'backend-exec';
      const mockFn = jest.fn().mockResolvedValue(undefined);

      // Act
      await service.execute(backendId, mockFn);

      // Assert
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);
    });

    it('should throw CircuitOpenError when circuit is OPEN', async () => {
      // Arrange
      const backendId = 'backend-blocked';
      const mockFn = jest.fn().mockResolvedValue(undefined);

      // Open the circuit
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      // Act & Assert
      await expect(service.execute(backendId, mockFn)).rejects.toThrow(
        CircuitOpenError,
      );
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should record success when function succeeds', async () => {
      // Arrange
      const backendId = 'backend-success-exec';
      const mockFn = jest.fn().mockResolvedValue(undefined);

      // Start with 2 failures
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      // Act - Successful execution
      await service.execute(backendId, mockFn);

      // Assert - Failure count should be reset
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      // Should be able to handle 2 more failures without opening
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);
    });

    it('should record failure when function throws', async () => {
      // Arrange
      const backendId = 'backend-fail-exec';
      const mockError = new Error('Network timeout');
      const mockFn = jest.fn().mockRejectedValue(mockError);

      // Act & Assert
      await expect(service.execute(backendId, mockFn)).rejects.toThrow(
        'Network timeout',
      );

      // Should have recorded 1 failure
      const stats = service.getCircuitStats();
      const backendStats = stats.get(backendId);
      expect(backendStats?.failureCount).toBe(1);
    });

    it('should open circuit after 3 failed executions', async () => {
      // Arrange
      const backendId = 'backend-cascade-fail';
      const mockError = new Error('Connection refused');
      const mockFn = jest.fn().mockRejectedValue(mockError);

      // Act - Execute 3 times
      await expect(service.execute(backendId, mockFn)).rejects.toThrow();
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      await expect(service.execute(backendId, mockFn)).rejects.toThrow();
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      await expect(service.execute(backendId, mockFn)).rejects.toThrow();

      // Assert - Circuit should be OPEN
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      // Next call should fail fast without executing function
      mockFn.mockClear();
      await expect(service.execute(backendId, mockFn)).rejects.toThrow(
        CircuitOpenError,
      );
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should allow execution in HALF_OPEN state', async () => {
      // Arrange
      const backendId = 'backend-half-open-exec';
      const mockFn = jest.fn().mockResolvedValue(undefined);

      // Open circuit
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      // Transition to HALF_OPEN
      jest.useFakeTimers();
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      // Act - Execute in HALF_OPEN
      await service.execute(backendId, mockFn);

      // Assert
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      jest.useRealTimers();
    });
  });

  describe('success resets count', () => {
    it('should reset failure count on success in CLOSED state', () => {
      // Arrange
      const backendId = 'backend-reset-count';

      // Record 2 failures
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      // Act - Record success
      service.recordSuccess(backendId);

      // Assert - Should need 3 new failures to open
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);
    });

    it('should reset failure count after multiple success/failure cycles', () => {
      // Arrange
      const backendId = 'backend-cycles';

      // Cycle 1: 2 failures, then success
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordSuccess(backendId);

      // Cycle 2: 1 failure, then success
      service.recordFailure(backendId);
      service.recordSuccess(backendId);

      // Act - Now need 3 failures to open
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      // Assert
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);
    });
  });

  describe('getCircuitStats', () => {
    it('should return empty map for no circuits', () => {
      // Act
      const stats = service.getCircuitStats();

      // Assert
      expect(stats.size).toBe(0);
    });

    it('should return stats for all registered circuits', () => {
      // Arrange
      service.recordFailure('backend-1');
      service.recordFailure('backend-2');
      service.recordFailure('backend-2');

      // Act
      const stats = service.getCircuitStats();

      // Assert
      expect(stats.size).toBe(2);
      expect(stats.get('backend-1')?.failureCount).toBe(1);
      expect(stats.get('backend-2')?.failureCount).toBe(2);
    });

    it('should include time since open for OPEN circuits', () => {
      // Arrange
      const backendId = 'backend-time';

      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);

      jest.useFakeTimers();

      // Wait 2 minutes
      jest.advanceTimersByTime(2 * 60 * 1000);

      // Act
      const stats = service.getCircuitStats();

      // Assert
      const backendStats = stats.get(backendId);
      expect(backendStats?.state).toBe(CircuitState.OPEN);
      expect(backendStats?.openedAt).toBeDefined();
      expect(backendStats?.timeSinceOpen).toBe(2 * 60 * 1000);

      jest.useRealTimers();
    });

    it('should show null timeSinceOpen for CLOSED circuits', () => {
      // Arrange
      service.recordFailure('backend-closed');

      // Act
      const stats = service.getCircuitStats();

      // Assert
      const backendStats = stats.get('backend-closed');
      expect(backendStats?.state).toBe(CircuitState.CLOSED);
      expect(backendStats?.openedAt).toBeNull();
      expect(backendStats?.timeSinceOpen).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear all circuit state', () => {
      // Arrange
      service.recordFailure('backend-1');
      service.recordFailure('backend-2');
      service.recordFailure('backend-2');
      service.recordFailure('backend-2');

      expect(service.getCircuitStats().size).toBe(2);

      // Act
      service.reset();

      // Assert
      expect(service.getCircuitStats().size).toBe(0);
    });

    it('should reset circuits to CLOSED state', () => {
      // Arrange
      service.recordFailure('backend-open');
      service.recordFailure('backend-open');
      service.recordFailure('backend-open');
      expect(service.getState('backend-open')).toBe(CircuitState.OPEN);

      // Act
      service.reset();

      // Assert
      expect(service.getState('backend-open')).toBe(CircuitState.CLOSED);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid failure/success cycles', () => {
      // Arrange
      const backendId = 'backend-rapid';

      // Act - Rapid cycles
      for (let i = 0; i < 10; i++) {
        service.recordFailure(backendId);
        service.recordSuccess(backendId);
      }

      // Assert - Should still be CLOSED
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);
    });

    it('should handle concurrent backend operations', () => {
      // Arrange - Multiple backends failing independently
      const backends = ['b1', 'b2', 'b3', 'b4', 'b5'];

      // Act - Different failure counts
      backends.forEach((id, index) => {
        for (let i = 0; i <= index; i++) {
          service.recordFailure(id);
        }
      });

      // Assert
      expect(service.getState('b1')).toBe(CircuitState.CLOSED); // 1 failure
      expect(service.getState('b2')).toBe(CircuitState.CLOSED); // 2 failures
      expect(service.getState('b3')).toBe(CircuitState.OPEN); // 3 failures
      expect(service.getState('b4')).toBe(CircuitState.OPEN); // 4 failures
      expect(service.getState('b5')).toBe(CircuitState.OPEN); // 5 failures
    });

    it('should handle empty backend ID', () => {
      // Act & Assert - Should not throw
      expect(() => service.recordFailure('')).not.toThrow();
      expect(() => service.recordSuccess('')).not.toThrow();
      expect(service.getState('')).toBe(CircuitState.CLOSED);
    });

    it('should isolate backends - one failure does not affect others', () => {
      // Arrange
      service.recordFailure('backend-fail');
      service.recordFailure('backend-fail');
      service.recordFailure('backend-fail');

      // Act - Check other backends
      const healthyState = service.getState('backend-healthy');

      // Assert
      expect(service.getState('backend-fail')).toBe(CircuitState.OPEN);
      expect(healthyState).toBe(CircuitState.CLOSED);
    });
  });

  describe('CircuitOpenError', () => {
    it('should create error with backend ID in message', () => {
      // Act
      const error = new CircuitOpenError('test-backend');

      // Assert
      expect(error.message).toContain('test-backend');
      expect(error.name).toBe('CircuitOpenError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('full state machine flow', () => {
    it('should complete full cycle: CLOSED → OPEN → HALF_OPEN → CLOSED', () => {
      // Arrange
      const backendId = 'backend-full-cycle';

      // 1. Start CLOSED
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      // 2. CLOSED → OPEN (3 failures)
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      jest.useFakeTimers();

      // 3. OPEN → HALF_OPEN (after 5 min)
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      // 4. HALF_OPEN → CLOSED (success)
      service.recordSuccess(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      jest.useRealTimers();
    });

    it('should handle failed recovery: CLOSED → OPEN → HALF_OPEN → OPEN → HALF_OPEN → CLOSED', () => {
      // Arrange
      const backendId = 'backend-retry-cycle';

      // 1. CLOSED → OPEN
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      jest.useFakeTimers();

      // 2. OPEN → HALF_OPEN
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      // 3. HALF_OPEN → OPEN (failed attempt)
      service.recordFailure(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.OPEN);

      // 4. OPEN → HALF_OPEN (retry)
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(service.getState(backendId)).toBe(CircuitState.HALF_OPEN);

      // 5. HALF_OPEN → CLOSED (success)
      service.recordSuccess(backendId);
      expect(service.getState(backendId)).toBe(CircuitState.CLOSED);

      jest.useRealTimers();
    });
  });
});
