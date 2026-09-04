import { Injectable, Logger } from '@nestjs/common';

/**
 * Circuit breaker states per ADR-3: Circuit Breaker Pattern
 *
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing recovery, limited requests allowed
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker error thrown when circuit is open
 *
 * Per Requirement 8.2: NOT block or retry broadcast when Backend fails
 */
export class CircuitOpenError extends Error {
  constructor(backendId: string) {
    super(`Circuit breaker open for backend: ${backendId}`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Internal circuit state tracker
 */
interface Circuit {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  openedAt: number | null;
}

/**
 * Per-backend circuit breaker service
 *
 * Per ADR-3: Circuit Breaker Pattern
 * - 3 failure threshold (CLOSED → OPEN)
 * - 5 minute timeout (OPEN → HALF_OPEN)
 * - Auto-recovery via half-open state
 * - Isolates failures (one backend doesn't block others)
 *
 * Per Requirements 6.2, 6.3: Fail fast, auto-recovery
 *
 * @injectable NestJS service
 */
@Injectable()
export class BackendCircuitBreakerService {
  private readonly logger = new Logger(BackendCircuitBreakerService.name);

  // Circuit state per backend ID
  private readonly circuits: Map<string, Circuit> = new Map();

  // Circuit breaker configuration
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RECOVERY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Execute a function with circuit breaker protection
   *
   * Per Requirement 6.2: Fail fast after 3 consecutive failures
   * Per Requirement 6.3: Auto-recovery after 5 minutes
   *
   * @param backendId - Unique backend identifier
   * @param fn - Async function to execute
   * @throws CircuitOpenError when circuit is open
   */
  async execute(backendId: string, fn: () => Promise<void>): Promise<void> {
    const circuit = this.getOrCreateCircuit(backendId);

    // Check if circuit should transition to HALF_OPEN
    this.checkRecoveryTimeout(backendId, circuit);

    // Fail fast if circuit is OPEN
    if (circuit.state === CircuitState.OPEN) {
      this.logger.debug(`Circuit OPEN for backend ${backendId}, failing fast`);
      throw new CircuitOpenError(backendId);
    }

    // Execute the function and handle result
    try {
      await fn();
      this.recordSuccess(backendId);
    } catch (error) {
      this.recordFailure(backendId);
      throw error;
    }
  }

  /**
   * Record a successful operation
   *
   * Per ADR-3: Circuit closes on successful half-open attempt
   * Per ADR-3: Success resets failure count
   *
   * @param backendId - Backend identifier
   */
  recordSuccess(backendId: string): void {
    const circuit = this.getOrCreateCircuit(backendId);

    const previousState = circuit.state;

    // Reset failure tracking
    circuit.failureCount = 0;
    circuit.lastFailureTime = null;

    // Close circuit if it was HALF_OPEN
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.state = CircuitState.CLOSED;
      circuit.openedAt = null;

      this.logger.log(
        `Circuit recovered for backend ${backendId}: HALF_OPEN → CLOSED`,
      );
    }

    if (
      previousState !== CircuitState.CLOSED &&
      circuit.state === CircuitState.CLOSED
    ) {
      this.logger.log(`Circuit fully recovered for backend ${backendId}`);
    }
  }

  /**
   * Record a failed operation
   *
   * Per ADR-3: Circuit opens after 3 consecutive failures
   * Per ADR-3: Circuit reopens on failed half-open attempt
   *
   * @param backendId - Backend identifier
   */
  recordFailure(backendId: string): void {
    const circuit = this.getOrCreateCircuit(backendId);

    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    this.logger.warn(
      `Backend ${backendId} failure recorded (count: ${circuit.failureCount})`,
    );

    // Handle state transitions based on current state
    if (circuit.state === CircuitState.HALF_OPEN) {
      // HALF_OPEN → OPEN on failure
      circuit.state = CircuitState.OPEN;
      circuit.openedAt = Date.now();

      this.logger.warn(
        `Circuit reopened for backend ${backendId}: HALF_OPEN → OPEN after failure`,
      );
    } else if (
      circuit.state === CircuitState.CLOSED &&
      circuit.failureCount >= this.FAILURE_THRESHOLD
    ) {
      // CLOSED → OPEN after threshold
      circuit.state = CircuitState.OPEN;
      circuit.openedAt = Date.now();

      this.logger.error(
        `Circuit opened for backend ${backendId}: CLOSED → OPEN after ${this.FAILURE_THRESHOLD} failures`,
      );
    }
  }

  /**
   * Get current circuit state for a backend
   *
   * @param backendId - Backend identifier
   * @returns Current circuit state
   */
  getState(backendId: string): CircuitState {
    const circuit = this.getOrCreateCircuit(backendId);

    // Check if recovery timeout has passed
    this.checkRecoveryTimeout(backendId, circuit);

    return circuit.state;
  }

  /**
   * Get or create a circuit for a backend
   *
   * @param backendId - Backend identifier
   * @returns Circuit state object
   */
  private getOrCreateCircuit(backendId: string): Circuit {
    if (!this.circuits.has(backendId)) {
      this.circuits.set(backendId, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: null,
        openedAt: null,
      });
    }

    return this.circuits.get(backendId)!;
  }

  /**
   * Check if circuit should transition from OPEN to HALF_OPEN
   *
   * Per ADR-3: Circuit half-opens after 5 minutes (RECOVERY_TIMEOUT_MS)
   *
   * @param backendId - Backend identifier
   * @param circuit - Circuit state object
   */
  private checkRecoveryTimeout(backendId: string, circuit: Circuit): void {
    if (circuit.state === CircuitState.OPEN && circuit.openedAt !== null) {
      const timeSinceOpen = Date.now() - circuit.openedAt;

      if (timeSinceOpen >= this.RECOVERY_TIMEOUT_MS) {
        circuit.state = CircuitState.HALF_OPEN;

        this.logger.log(
          `Circuit half-opened for backend ${backendId}: OPEN → HALF_OPEN after ${this.RECOVERY_TIMEOUT_MS}ms`,
        );
      }
    }
  }

  /**
   * Get circuit statistics for monitoring
   *
   * @returns Map of backend ID to circuit state details
   */
  getCircuitStats(): Map<
    string,
    {
      state: CircuitState;
      failureCount: number;
      lastFailureTime: number | null;
      openedAt: number | null;
      timeSinceOpen: number | null;
    }
  > {
    const stats = new Map();

    for (const [backendId, circuit] of this.circuits.entries()) {
      stats.set(backendId, {
        state: circuit.state,
        failureCount: circuit.failureCount,
        lastFailureTime: circuit.lastFailureTime,
        openedAt: circuit.openedAt,
        timeSinceOpen:
          circuit.openedAt !== null ? Date.now() - circuit.openedAt : null,
      });
    }

    return stats;
  }

  /**
   * Reset all circuits (useful for testing)
   */
  reset(): void {
    this.circuits.clear();
    this.logger.log('All circuits reset');
  }
}
