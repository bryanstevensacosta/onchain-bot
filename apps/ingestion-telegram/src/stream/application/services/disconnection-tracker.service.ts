import { Injectable, Logger } from '@nestjs/common';

/**
 * Disconnection window structure
 *
 * Per GAP 3: Track client disconnection and reconnection timestamps
 */
export interface DisconnectionWindow {
  clientId: string;
  disconnectedAt: Date;
  reconnectedAt: Date | null;
  durationMs: number | null; // null if still disconnected
}

/**
 * DisconnectionTracker tracks SSE client disconnection windows.
 *
 * Per GAP 3 (Requirement 9.2): Monitor client stability and connection health
 *
 * Features:
 * - Track when clients disconnect and reconnect
 * - Calculate disconnection window durations
 * - Identify connections with prolonged downtime (>60s)
 * - Provide metrics for health endpoint
 *
 * @injectable NestJS service
 */
@Injectable()
export class DisconnectionTracker {
  private readonly logger = new Logger(DisconnectionTracker.name);

  // Map of clientId -> disconnection timestamp (for currently disconnected clients)
  private readonly activeDisconnections = new Map<string, Date>();

  // Array of completed disconnection windows (with reconnectedAt)
  private readonly completedWindows: DisconnectionWindow[] = [];

  // Maximum number of completed windows to keep in memory
  private readonly MAX_COMPLETED_WINDOWS = 100;

  /**
   * Record a client disconnection
   *
   * Per GAP 3: Track disconnectedAt timestamp when client loses connection
   *
   * @param clientId - Unique identifier of the disconnected client
   */
  recordDisconnection(clientId: string): void {
    const now = new Date();
    this.activeDisconnections.set(clientId, now);

    this.logger.debug(
      `Recorded disconnection for client ${clientId} at ${now.toISOString()}`,
    );
  }

  /**
   * Record a client reconnection
   *
   * Per GAP 3: Track reconnectedAt timestamp and calculate window duration
   *
   * @param clientId - Unique identifier of the reconnected client
   */
  recordReconnection(clientId: string): void {
    const disconnectedAt = this.activeDisconnections.get(clientId);

    // Only record reconnection if we have a prior disconnection
    if (!disconnectedAt) {
      this.logger.debug(
        `No prior disconnection found for client ${clientId} - treating as initial connection`,
      );
      return;
    }

    const reconnectedAt = new Date();
    const durationMs = reconnectedAt.getTime() - disconnectedAt.getTime();

    const window: DisconnectionWindow = {
      clientId,
      disconnectedAt,
      reconnectedAt,
      durationMs,
    };

    // Move from active to completed
    this.activeDisconnections.delete(clientId);
    this.completedWindows.push(window);

    // Trim old completed windows to prevent memory growth
    if (this.completedWindows.length > this.MAX_COMPLETED_WINDOWS) {
      this.completedWindows.shift();
    }

    this.logger.log(
      `Client ${clientId} reconnected after ${durationMs}ms disconnection`,
    );
  }

  /**
   * Get all disconnection windows (active + completed)
   *
   * Per GAP 3: Expose via /health endpoint under clients.disconnectionWindows
   *
   * @returns Array of all disconnection windows
   */
  getDisconnectionWindows(): DisconnectionWindow[] {
    const now = new Date();

    // Convert active disconnections to windows (with null reconnectedAt)
    const activeWindows: DisconnectionWindow[] = Array.from(
      this.activeDisconnections.entries(),
    ).map(([clientId, disconnectedAt]) => ({
      clientId,
      disconnectedAt,
      reconnectedAt: null,
      durationMs: now.getTime() - disconnectedAt.getTime(), // Current duration
    }));

    // Combine active and completed windows
    return [...activeWindows, ...this.completedWindows];
  }

  /**
   * Check if any disconnection window exceeds the threshold
   *
   * Per GAP 3: Add WARNING flag when any window duration >60s
   *
   * @param thresholdMs - Duration threshold in milliseconds (default 60s)
   * @returns true if any window exceeds threshold
   */
  hasLongDisconnectionWindow(thresholdMs: number = 60_000): boolean {
    const windows = this.getDisconnectionWindows();

    return windows.some((window) => {
      const duration = window.durationMs;
      return duration !== null && duration > thresholdMs;
    });
  }

  /**
   * Get statistics about disconnection windows
   *
   * @returns Summary statistics for monitoring
   */
  getStatistics(): {
    activeDisconnections: number;
    completedWindows: number;
    totalWindows: number;
    maxDurationMs: number | null;
    hasWarning: boolean;
  } {
    const windows = this.getDisconnectionWindows();
    const durations = windows
      .map((w) => w.durationMs)
      .filter((d): d is number => d !== null);

    return {
      activeDisconnections: this.activeDisconnections.size,
      completedWindows: this.completedWindows.length,
      totalWindows: windows.length,
      maxDurationMs: durations.length > 0 ? Math.max(...durations) : null,
      hasWarning: this.hasLongDisconnectionWindow(),
    };
  }

  /**
   * Clear all disconnection tracking data
   *
   * Useful for testing or manual reset
   */
  clear(): void {
    this.activeDisconnections.clear();
    this.completedWindows.length = 0;
    this.logger.log('Cleared all disconnection tracking data');
  }
}
