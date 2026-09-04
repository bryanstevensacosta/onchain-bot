/**
 * Unit tests for BackendRegistration entity
 *
 * Validates:
 * - Constructor validation (non-empty backendId)
 * - Whitelist management (update, lookup)
 * - Timestamp tracking (registration, disconnection)
 * - O(1) channel lookup performance
 */

import { BackendRegistration } from './backend-registration.entity';

describe('BackendRegistration', () => {
  describe('constructor', () => {
    it('should create a registration with valid backendId and sourceWhitelist', () => {
      // Arrange
      const backendId = 'production';
      const sourceWhitelist = ['channel1', 'channel2', 'channel3'];

      // Act
      const registration = new BackendRegistration(backendId, sourceWhitelist);

      // Assert
      expect(registration.backendId).toBe(backendId);
      expect(registration.getWhitelistArray()).toEqual(
        expect.arrayContaining(sourceWhitelist),
      );
      expect(registration.getWhitelistArray().length).toBe(
        sourceWhitelist.length,
      );
      expect(registration.apiVersion).toBe('v1');
      expect(registration.registeredAt).toBeGreaterThan(0);
      expect(registration.lastSeenTimestamp).toBeGreaterThan(0);
    });

    it('should create a registration with custom apiVersion', () => {
      // Arrange
      const backendId = 'staging';
      const sourceWhitelist = ['channel1'];
      const apiVersion = 'v2';

      // Act
      const registration = new BackendRegistration(
        backendId,
        sourceWhitelist,
        apiVersion,
      );

      // Assert
      expect(registration.apiVersion).toBe(apiVersion);
    });

    it('should create a registration with empty sourceWhitelist', () => {
      // Arrange
      const backendId = 'dev';
      const sourceWhitelist: string[] = [];

      // Act
      const registration = new BackendRegistration(backendId, sourceWhitelist);

      // Assert
      expect(registration.getWhitelistArray()).toEqual([]);
      expect(registration.sourceWhitelist.size).toBe(0);
    });

    it('should deduplicate channel IDs in sourceWhitelist', () => {
      // Arrange
      const backendId = 'production';
      const sourceWhitelist = ['channel1', 'channel2', 'channel1', 'channel3'];

      // Act
      const registration = new BackendRegistration(backendId, sourceWhitelist);

      // Assert
      expect(registration.sourceWhitelist.size).toBe(3);
      expect(registration.getWhitelistArray()).toEqual(
        expect.arrayContaining(['channel1', 'channel2', 'channel3']),
      );
    });

    it('should throw error if backendId is empty string', () => {
      // Arrange
      const backendId = '';
      const sourceWhitelist = ['channel1'];

      // Act & Assert
      expect(() => new BackendRegistration(backendId, sourceWhitelist)).toThrow(
        'BackendRegistration: backendId must be non-empty',
      );
    });

    it('should throw error if backendId is whitespace only', () => {
      // Arrange
      const backendId = '   ';
      const sourceWhitelist = ['channel1'];

      // Act & Assert
      expect(() => new BackendRegistration(backendId, sourceWhitelist)).toThrow(
        'BackendRegistration: backendId must be non-empty',
      );
    });

    it('should set registeredAt and lastSeenTimestamp to current time', () => {
      // Arrange
      const backendId = 'production';
      const sourceWhitelist = ['channel1'];
      const beforeTime = Date.now();

      // Act
      const registration = new BackendRegistration(backendId, sourceWhitelist);
      const afterTime = Date.now();

      // Assert
      expect(registration.registeredAt).toBeGreaterThanOrEqual(beforeTime);
      expect(registration.registeredAt).toBeLessThanOrEqual(afterTime);
      expect(registration.lastSeenTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(registration.lastSeenTimestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('updateWhitelist', () => {
    it('should update whitelist with new channel IDs', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        'channel1',
        'channel2',
      ]);
      const newWhitelist = ['channel3', 'channel4', 'channel5'];

      // Act
      registration.updateWhitelist(newWhitelist);

      // Assert
      expect(registration.getWhitelistArray()).toEqual(
        expect.arrayContaining(newWhitelist),
      );
      expect(registration.getWhitelistArray().length).toBe(newWhitelist.length);
      expect(registration.hasChannel('channel1')).toBe(false);
      expect(registration.hasChannel('channel2')).toBe(false);
      expect(registration.hasChannel('channel3')).toBe(true);
    });

    it('should replace whitelist with empty array', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        'channel1',
        'channel2',
      ]);

      // Act
      registration.updateWhitelist([]);

      // Assert
      expect(registration.getWhitelistArray()).toEqual([]);
      expect(registration.sourceWhitelist.size).toBe(0);
    });

    it('should deduplicate channels in new whitelist', () => {
      // Arrange
      const registration = new BackendRegistration('production', ['channel1']);
      const newWhitelist = ['channel2', 'channel3', 'channel2', 'channel4'];

      // Act
      registration.updateWhitelist(newWhitelist);

      // Assert
      expect(registration.sourceWhitelist.size).toBe(3);
      expect(registration.getWhitelistArray()).toEqual(
        expect.arrayContaining(['channel2', 'channel3', 'channel4']),
      );
    });

    it('should handle updating to the same whitelist', () => {
      // Arrange
      const whitelist = ['channel1', 'channel2'];
      const registration = new BackendRegistration('production', whitelist);

      // Act
      registration.updateWhitelist(whitelist);

      // Assert
      expect(registration.getWhitelistArray()).toEqual(
        expect.arrayContaining(whitelist),
      );
      expect(registration.sourceWhitelist.size).toBe(whitelist.length);
    });
  });

  describe('recordDisconnect', () => {
    it('should update lastSeenTimestamp to current time', () => {
      // Arrange
      const registration = new BackendRegistration('production', ['channel1']);
      const initialTimestamp = registration.lastSeenTimestamp;

      // Wait a bit to ensure time has passed
      const waitPromise = new Promise((resolve) => setTimeout(resolve, 10));

      // Act
      return waitPromise.then(() => {
        registration.recordDisconnect();

        // Assert
        expect(registration.lastSeenTimestamp).toBeGreaterThan(
          initialTimestamp,
        );
      });
    });

    it('should update lastSeenTimestamp on multiple disconnections', () => {
      // Arrange
      const registration = new BackendRegistration('production', ['channel1']);

      // Act
      const timestamp1 = registration.lastSeenTimestamp;
      registration.recordDisconnect();
      const timestamp2 = registration.lastSeenTimestamp;

      return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
        registration.recordDisconnect();
        const timestamp3 = registration.lastSeenTimestamp;

        // Assert
        expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
        expect(timestamp3).toBeGreaterThan(timestamp2);
      });
    });

    it('should not affect registeredAt timestamp', () => {
      // Arrange
      const registration = new BackendRegistration('production', ['channel1']);
      const registeredAt = registration.registeredAt;

      // Act
      registration.recordDisconnect();

      // Assert
      expect(registration.registeredAt).toBe(registeredAt);
    });
  });

  describe('hasChannel', () => {
    it('should return true for channel in whitelist', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        'channel1',
        'channel2',
        'channel3',
      ]);

      // Act & Assert
      expect(registration.hasChannel('channel1')).toBe(true);
      expect(registration.hasChannel('channel2')).toBe(true);
      expect(registration.hasChannel('channel3')).toBe(true);
    });

    it('should return false for channel not in whitelist', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        'channel1',
        'channel2',
      ]);

      // Act & Assert
      expect(registration.hasChannel('channel3')).toBe(false);
      expect(registration.hasChannel('channel4')).toBe(false);
      expect(registration.hasChannel('nonexistent')).toBe(false);
    });

    it('should return false for empty whitelist', () => {
      // Arrange
      const registration = new BackendRegistration('production', []);

      // Act & Assert
      expect(registration.hasChannel('channel1')).toBe(false);
    });

    it('should perform O(1) lookup (Set-based)', () => {
      // Arrange - Create large whitelist
      const largeWhitelist = Array.from(
        { length: 10000 },
        (_, i) => `channel${i}`,
      );
      const registration = new BackendRegistration(
        'production',
        largeWhitelist,
      );

      // Act & Assert - Should be fast regardless of whitelist size
      const startTime = performance.now();
      const result = registration.hasChannel('channel5000');
      const endTime = performance.now();

      expect(result).toBe(true);
      // O(1) lookup should complete in under 1ms even with 10k channels
      expect(endTime - startTime).toBeLessThan(1);
    });

    it('should handle special characters in channel IDs', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        '-1001234567890',
        '@channelname',
        'channel_with_underscore',
        'channel-with-dash',
      ]);

      // Act & Assert
      expect(registration.hasChannel('-1001234567890')).toBe(true);
      expect(registration.hasChannel('@channelname')).toBe(true);
      expect(registration.hasChannel('channel_with_underscore')).toBe(true);
      expect(registration.hasChannel('channel-with-dash')).toBe(true);
    });
  });

  describe('getWhitelistArray', () => {
    it('should return array containing all channels', () => {
      // Arrange
      const sourceWhitelist = ['channel1', 'channel2', 'channel3'];
      const registration = new BackendRegistration(
        'production',
        sourceWhitelist,
      );

      // Act
      const result = registration.getWhitelistArray();

      // Assert
      expect(result).toEqual(expect.arrayContaining(sourceWhitelist));
      expect(result.length).toBe(sourceWhitelist.length);
    });

    it('should return empty array for empty whitelist', () => {
      // Arrange
      const registration = new BackendRegistration('production', []);

      // Act
      const result = registration.getWhitelistArray();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return a new array instance each time', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        'channel1',
        'channel2',
      ]);

      // Act
      const result1 = registration.getWhitelistArray();
      const result2 = registration.getWhitelistArray();

      // Assert
      expect(result1).not.toBe(result2); // Different array instances
      expect(result1).toEqual(result2); // But same content
    });

    it('should reflect updated whitelist', () => {
      // Arrange
      const registration = new BackendRegistration('production', ['channel1']);

      // Act
      const before = registration.getWhitelistArray();
      registration.updateWhitelist(['channel2', 'channel3']);
      const after = registration.getWhitelistArray();

      // Assert
      expect(before).toEqual(['channel1']);
      expect(after).toEqual(expect.arrayContaining(['channel2', 'channel3']));
      expect(after.length).toBe(2);
    });
  });

  describe('edge cases and integration', () => {
    it('should handle large whitelists efficiently', () => {
      // Arrange
      const largeWhitelist = Array.from(
        { length: 10000 },
        (_, i) => `channel${i}`,
      );

      // Act
      const registration = new BackendRegistration(
        'production',
        largeWhitelist,
      );

      // Assert
      expect(registration.sourceWhitelist.size).toBe(10000);
      expect(registration.hasChannel('channel0')).toBe(true);
      expect(registration.hasChannel('channel9999')).toBe(true);
      expect(registration.hasChannel('channel10000')).toBe(false);
    });

    it('should maintain immutability of backendId', () => {
      // Arrange
      const registration = new BackendRegistration('production', ['channel1']);

      // Act & Assert
      // TypeScript should prevent this at compile time, but verify at runtime
      expect(() => {
        // @ts-expect-error - Testing runtime immutability
        registration.backendId = 'staging';
      }).toThrow();
    });

    it('should maintain immutability of registeredAt', () => {
      // Arrange
      const registration = new BackendRegistration('production', ['channel1']);

      // Act & Assert
      expect(() => {
        // @ts-expect-error - Testing runtime immutability
        registration.registeredAt = Date.now();
      }).toThrow();
    });

    it('should handle Unicode channel IDs', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        'チャンネル',
        'канал',
        '频道',
      ]);

      // Act & Assert
      expect(registration.hasChannel('チャンネル')).toBe(true);
      expect(registration.hasChannel('канал')).toBe(true);
      expect(registration.hasChannel('频道')).toBe(true);
    });

    it('should handle realistic telegram channel ID formats', () => {
      // Arrange
      const registration = new BackendRegistration('production', [
        '-1001234567890', // Supergroup/channel format
        '@username', // Username format
        '123456789', // Bot/user ID format
      ]);

      // Act & Assert
      expect(registration.hasChannel('-1001234567890')).toBe(true);
      expect(registration.hasChannel('@username')).toBe(true);
      expect(registration.hasChannel('123456789')).toBe(true);
    });
  });
});
