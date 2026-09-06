import { Test, TestingModule } from '@nestjs/testing';
import { DisconnectionTracker } from './disconnection-tracker.service';

describe('DisconnectionTracker', () => {
  let service: DisconnectionTracker;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DisconnectionTracker],
    }).compile();

    service = module.get<DisconnectionTracker>(DisconnectionTracker);
  });

  afterEach(() => {
    service.clear();
  });

  describe('recordDisconnection', () => {
    it('should record a client disconnection', () => {
      const clientId = 'client-1';

      service.recordDisconnection(clientId);

      const windows = service.getDisconnectionWindows();
      expect(windows).toHaveLength(1);
      expect(windows[0].clientId).toBe(clientId);
      expect(windows[0].disconnectedAt).toBeInstanceOf(Date);
      expect(windows[0].reconnectedAt).toBeNull();
      expect(windows[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple disconnected clients', () => {
      service.recordDisconnection('client-1');
      service.recordDisconnection('client-2');
      service.recordDisconnection('client-3');

      const windows = service.getDisconnectionWindows();
      expect(windows).toHaveLength(3);
      expect(windows.map((w) => w.clientId)).toEqual([
        'client-1',
        'client-2',
        'client-3',
      ]);
    });
  });

  describe('recordReconnection', () => {
    it('should record a client reconnection', () => {
      const clientId = 'client-1';

      service.recordDisconnection(clientId);
      service.recordReconnection(clientId);

      const windows = service.getDisconnectionWindows();
      expect(windows).toHaveLength(1);
      expect(windows[0].clientId).toBe(clientId);
      expect(windows[0].disconnectedAt).toBeInstanceOf(Date);
      expect(windows[0].reconnectedAt).toBeInstanceOf(Date);
      expect(windows[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle reconnection without prior disconnection', () => {
      const clientId = 'client-1';

      service.recordReconnection(clientId);

      const windows = service.getDisconnectionWindows();
      expect(windows).toHaveLength(0);
    });

    it('should calculate correct duration', async () => {
      const clientId = 'client-1';

      service.recordDisconnection(clientId);
      await new Promise((resolve) => setTimeout(resolve, 100));
      service.recordReconnection(clientId);

      const windows = service.getDisconnectionWindows();
      // Allow ±1ms timing variance in CI
      expect(windows[0].durationMs).toBeGreaterThanOrEqual(99);
      expect(windows[0].durationMs).toBeLessThan(200);
    });

    it('should move window from active to completed', () => {
      const clientId = 'client-1';

      service.recordDisconnection(clientId);
      let stats = service.getStatistics();
      expect(stats.activeDisconnections).toBe(1);
      expect(stats.completedWindows).toBe(0);

      service.recordReconnection(clientId);
      stats = service.getStatistics();
      expect(stats.activeDisconnections).toBe(0);
      expect(stats.completedWindows).toBe(1);
    });
  });

  describe('getDisconnectionWindows', () => {
    it('should return empty array when no disconnections', () => {
      const windows = service.getDisconnectionWindows();
      expect(windows).toEqual([]);
    });

    it('should return active disconnections with null reconnectedAt', () => {
      service.recordDisconnection('client-1');

      const windows = service.getDisconnectionWindows();
      expect(windows[0].reconnectedAt).toBeNull();
    });

    it('should return completed disconnections with reconnectedAt', () => {
      service.recordDisconnection('client-1');
      service.recordReconnection('client-1');

      const windows = service.getDisconnectionWindows();
      expect(windows[0].reconnectedAt).toBeInstanceOf(Date);
    });

    it('should combine active and completed windows', () => {
      service.recordDisconnection('client-1');
      service.recordReconnection('client-1');
      service.recordDisconnection('client-2');

      const windows = service.getDisconnectionWindows();
      expect(windows).toHaveLength(2);
      expect(windows.some((w) => w.reconnectedAt !== null)).toBe(true);
      expect(windows.some((w) => w.reconnectedAt === null)).toBe(true);
    });
  });

  describe('hasLongDisconnectionWindow', () => {
    it('should return false when no disconnections', () => {
      expect(service.hasLongDisconnectionWindow()).toBe(false);
    });

    it('should return false when all windows are short', () => {
      service.recordDisconnection('client-1');
      service.recordReconnection('client-1');

      expect(service.hasLongDisconnectionWindow()).toBe(false);
    });

    it('should return true when a window exceeds 60s threshold', () => {
      const clientId = 'client-1';

      // Mock a disconnection that happened 61 seconds ago
      const disconnectedAt = new Date(Date.now() - 61_000);
      service['activeDisconnections'].set(clientId, disconnectedAt);

      expect(service.hasLongDisconnectionWindow()).toBe(true);
    });

    it('should use custom threshold', () => {
      const clientId = 'client-1';

      // Mock a disconnection that happened 10 seconds ago
      const disconnectedAt = new Date(Date.now() - 10_000);
      service['activeDisconnections'].set(clientId, disconnectedAt);

      expect(service.hasLongDisconnectionWindow(5_000)).toBe(true);
      expect(service.hasLongDisconnectionWindow(15_000)).toBe(false);
    });

    it('should check both active and completed windows', () => {
      const clientId = 'client-1';

      // Add a completed window with long duration
      const longAgo = new Date(Date.now() - 61_000);
      service['activeDisconnections'].set(clientId, longAgo);
      service.recordReconnection(clientId);

      expect(service.hasLongDisconnectionWindow()).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', () => {
      const stats = service.getStatistics();

      expect(stats).toEqual({
        activeDisconnections: 0,
        completedWindows: 0,
        totalWindows: 0,
        maxDurationMs: null,
        hasWarning: false,
      });
    });

    it('should track active disconnections', () => {
      service.recordDisconnection('client-1');
      service.recordDisconnection('client-2');

      const stats = service.getStatistics();
      expect(stats.activeDisconnections).toBe(2);
      expect(stats.completedWindows).toBe(0);
      expect(stats.totalWindows).toBe(2);
    });

    it('should track completed windows', () => {
      service.recordDisconnection('client-1');
      service.recordReconnection('client-1');

      const stats = service.getStatistics();
      expect(stats.activeDisconnections).toBe(0);
      expect(stats.completedWindows).toBe(1);
      expect(stats.totalWindows).toBe(1);
    });

    it('should calculate max duration', () => {
      // Client 1: short disconnection
      service.recordDisconnection('client-1');
      service.recordReconnection('client-1');

      // Client 2: longer disconnection (mocked)
      const longAgo = new Date(Date.now() - 30_000);
      service['activeDisconnections'].set('client-2', longAgo);
      service.recordReconnection('client-2');

      const stats = service.getStatistics();
      expect(stats.maxDurationMs).toBeGreaterThanOrEqual(30_000);
    });

    it('should indicate warning when long disconnection exists', () => {
      const clientId = 'client-1';
      const longAgo = new Date(Date.now() - 61_000);
      service['activeDisconnections'].set(clientId, longAgo);

      const stats = service.getStatistics();
      expect(stats.hasWarning).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all tracking data', () => {
      service.recordDisconnection('client-1');
      service.recordDisconnection('client-2');
      service.recordReconnection('client-2');

      service.clear();

      const windows = service.getDisconnectionWindows();
      expect(windows).toEqual([]);

      const stats = service.getStatistics();
      expect(stats.activeDisconnections).toBe(0);
      expect(stats.completedWindows).toBe(0);
    });
  });

  describe('memory management', () => {
    it('should limit completed windows to MAX_COMPLETED_WINDOWS', () => {
      const MAX_COMPLETED_WINDOWS = 100;

      // Create more than MAX_COMPLETED_WINDOWS disconnections
      for (let i = 0; i < MAX_COMPLETED_WINDOWS + 10; i++) {
        service.recordDisconnection(`client-${i}`);
        service.recordReconnection(`client-${i}`);
      }

      const stats = service.getStatistics();
      expect(stats.completedWindows).toBe(MAX_COMPLETED_WINDOWS);

      const windows = service.getDisconnectionWindows();
      const completedWindows = windows.filter((w) => w.reconnectedAt !== null);
      expect(completedWindows).toHaveLength(MAX_COMPLETED_WINDOWS);
    });
  });
});
