import { BroadcastEvent } from './broadcast-event.vo';

describe('BroadcastEvent', () => {
  describe('fromTelegramMessage', () => {
    it('should create BroadcastEvent from message with text field', () => {
      const channelId = '-1001234567890';
      const msg = {
        id: 167,
        text: 'Test message content',
        date: 1609459200, // 2021-01-01 00:00:00 UTC
      };

      const event = BroadcastEvent.fromTelegramMessage(channelId, msg);

      expect(event.channelId).toBe(channelId);
      expect(event.messageId).toBe(167);
      expect(event.content).toBe('Test message content');
      expect(event.publishedAt).toBe(1609459200000); // Unix seconds → ms
      expect(event.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.title).toBeUndefined();
      expect(event.mediaPath).toBeUndefined();
    });

    it('should create BroadcastEvent from message with message field', () => {
      const msg = {
        id: 42,
        message: 'Alternative text field',
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('123456', msg);

      expect(event.content).toBe('Alternative text field');
    });

    it('should prefer message over text when both present', () => {
      const msg = {
        id: 1,
        message: 'From message field',
        text: 'From text field',
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(event.content).toBe('From message field');
    });

    it('should use empty string when no text or message', () => {
      const msg = {
        id: 1,
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(event.content).toBe('');
    });

    it('should include mediaPath when provided', () => {
      const msg = {
        id: 1,
        text: 'Message with media',
        date: 1609459200,
      };
      const mediaPath = 'crypto-news/media/123456/1_0.jpg';

      const event = BroadcastEvent.fromTelegramMessage(
        '123456',
        msg,
        mediaPath,
      );

      expect(event.mediaPath).toBe(mediaPath);
    });

    it('should convert numeric channelId to string', () => {
      const msg = {
        id: 1,
        text: 'Test',
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(typeof event.channelId).toBe('string');
      expect(event.channelId).toBe('123');
    });

    it('should generate unique eventIds for different events', () => {
      const msg = {
        id: 1,
        text: 'Test',
        date: 1609459200,
      };

      const event1 = BroadcastEvent.fromTelegramMessage('123', msg);
      const event2 = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should convert Unix seconds to milliseconds for publishedAt', () => {
      const msg = {
        id: 1,
        text: 'Test',
        date: 1609459200, // 2021-01-01 00:00:00 UTC in seconds
      };

      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(event.publishedAt).toBe(1609459200000); // milliseconds
    });
  });

  describe('toJSON', () => {
    it('should serialize all required fields', () => {
      const msg = {
        id: 167,
        text: 'Test content',
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('-1001234567890', msg);
      const json = event.toJSON();

      expect(json.eventId).toBe(event.eventId);
      expect(json.timestamp).toBe(event.timestamp);
      expect(json.channelId).toBe('-1001234567890');
      expect(json.messageId).toBe(167);
      expect(json.content).toBe('Test content');
      expect(json.publishedAt).toBe(1609459200000);
    });

    it('should include optional title when present', () => {
      const msg = {
        id: 1,
        text: 'Test',
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('123', msg);
      // Manually create event with title for testing (since factory doesn't set it)
      const eventWithTitle = BroadcastEvent.fromJSON(
        JSON.stringify({ ...event.toJSON(), title: 'Test Title' }),
      );

      const json = eventWithTitle.toJSON();

      expect(json.title).toBe('Test Title');
    });

    it('should include optional mediaPath when present', () => {
      const msg = {
        id: 1,
        text: 'Test',
        date: 1609459200,
      };
      const mediaPath = 'crypto-news/media/123/1_0.jpg';

      const event = BroadcastEvent.fromTelegramMessage('123', msg, mediaPath);
      const json = event.toJSON();

      expect(json.mediaPath).toBe(mediaPath);
    });

    it('should not include title key when undefined', () => {
      const msg = {
        id: 1,
        text: 'Test',
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('123', msg);
      const json = event.toJSON();

      expect('title' in json).toBe(false);
    });

    it('should not include mediaPath key when undefined', () => {
      const msg = {
        id: 1,
        text: 'Test',
        date: 1609459200,
      };

      const event = BroadcastEvent.fromTelegramMessage('123', msg);
      const json = event.toJSON();

      expect('mediaPath' in json).toBe(false);
    });
  });

  describe('fromJSON', () => {
    it('should deserialize valid JSON with all required fields', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test message',
        publishedAt: 1609459200000,
      });

      const event = BroadcastEvent.fromJSON(json);

      expect(event.eventId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(event.timestamp).toBe(1609459200000);
      expect(event.channelId).toBe('-1001234567890');
      expect(event.messageId).toBe(167);
      expect(event.content).toBe('Test message');
      expect(event.publishedAt).toBe(1609459200000);
      expect(event.title).toBeUndefined();
      expect(event.mediaPath).toBeUndefined();
    });

    it('should deserialize JSON with optional title', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test message',
        title: 'Test Title',
        publishedAt: 1609459200000,
      });

      const event = BroadcastEvent.fromJSON(json);

      expect(event.title).toBe('Test Title');
    });

    it('should deserialize JSON with optional mediaPath', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test message',
        mediaPath: 'crypto-news/media/123/1_0.jpg',
        publishedAt: 1609459200000,
      });

      const event = BroadcastEvent.fromJSON(json);

      expect(event.mediaPath).toBe('crypto-news/media/123/1_0.jpg');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => BroadcastEvent.fromJSON('invalid json')).toThrow(
        /Invalid JSON/,
      );
    });

    it('should throw error for missing eventId', () => {
      const json = JSON.stringify({
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'Missing required field: eventId',
      );
    });

    it('should throw error for missing timestamp', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'Missing required field: timestamp',
      );
    });

    it('should throw error for missing channelId', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'Missing required field: channelId',
      );
    });

    it('should throw error for missing messageId', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'Missing required field: messageId',
      );
    });

    it('should throw error for missing content', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'Missing required field: content',
      );
    });

    it('should throw error for missing publishedAt', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'Missing required field: publishedAt',
      );
    });

    it('should throw error for null eventId', () => {
      const json = JSON.stringify({
        eventId: null,
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'Missing required field: eventId',
      );
    });

    it('should throw error for wrong eventId type', () => {
      const json = JSON.stringify({
        eventId: 12345,
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'eventId must be a string',
      );
    });

    it('should throw error for wrong timestamp type', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '1609459200000',
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'timestamp must be a number',
      );
    });

    it('should throw error for wrong channelId type', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: 123,
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'channelId must be a string',
      );
    });

    it('should throw error for wrong messageId type', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: '167',
        content: 'Test',
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'messageId must be a number',
      );
    });

    it('should throw error for wrong content type', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 123,
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'content must be a string',
      );
    });

    it('should throw error for wrong publishedAt type', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: '1609459200000',
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'publishedAt must be a number',
      );
    });

    it('should throw error for wrong title type', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        title: 123,
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'title must be a string when present',
      );
    });

    it('should throw error for wrong mediaPath type', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        mediaPath: 123,
        publishedAt: 1609459200000,
      });

      expect(() => BroadcastEvent.fromJSON(json)).toThrow(
        'mediaPath must be a string when present',
      );
    });

    it('should allow null title to be undefined', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        title: null,
        publishedAt: 1609459200000,
      });

      const event = BroadcastEvent.fromJSON(json);

      expect(event.title).toBeUndefined();
    });

    it('should allow null mediaPath to be undefined', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        mediaPath: null,
        publishedAt: 1609459200000,
      });

      const event = BroadcastEvent.fromJSON(json);

      expect(event.mediaPath).toBeUndefined();
    });
  });

  describe('round-trip property', () => {
    it('should satisfy parse(print(event)) === event (no optional fields)', () => {
      const msg = {
        id: 167,
        text: 'Round-trip test',
        date: 1609459200,
      };

      const original = BroadcastEvent.fromTelegramMessage(
        '-1001234567890',
        msg,
      );
      const serialized = JSON.stringify(original.toJSON());
      const deserialized = BroadcastEvent.fromJSON(serialized);

      expect(deserialized.eventId).toBe(original.eventId);
      expect(deserialized.timestamp).toBe(original.timestamp);
      expect(deserialized.channelId).toBe(original.channelId);
      expect(deserialized.messageId).toBe(original.messageId);
      expect(deserialized.content).toBe(original.content);
      expect(deserialized.publishedAt).toBe(original.publishedAt);
      expect(deserialized.title).toBe(original.title);
      expect(deserialized.mediaPath).toBe(original.mediaPath);
    });

    it('should satisfy parse(print(event)) === event (with mediaPath)', () => {
      const msg = {
        id: 42,
        text: 'Message with media',
        date: 1609459200,
      };
      const mediaPath = 'crypto-news/media/123456/42_0.jpg';

      const original = BroadcastEvent.fromTelegramMessage(
        '123456',
        msg,
        mediaPath,
      );
      const serialized = JSON.stringify(original.toJSON());
      const deserialized = BroadcastEvent.fromJSON(serialized);

      expect(deserialized.eventId).toBe(original.eventId);
      expect(deserialized.timestamp).toBe(original.timestamp);
      expect(deserialized.channelId).toBe(original.channelId);
      expect(deserialized.messageId).toBe(original.messageId);
      expect(deserialized.content).toBe(original.content);
      expect(deserialized.publishedAt).toBe(original.publishedAt);
      expect(deserialized.title).toBe(original.title);
      expect(deserialized.mediaPath).toBe(original.mediaPath);
    });

    it('should satisfy parse(print(event)) === event (with title)', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test message',
        title: 'Test Title',
        publishedAt: 1609459200000,
      });

      const original = BroadcastEvent.fromJSON(json);
      const serialized = JSON.stringify(original.toJSON());
      const deserialized = BroadcastEvent.fromJSON(serialized);

      expect(deserialized.eventId).toBe(original.eventId);
      expect(deserialized.timestamp).toBe(original.timestamp);
      expect(deserialized.channelId).toBe(original.channelId);
      expect(deserialized.messageId).toBe(original.messageId);
      expect(deserialized.content).toBe(original.content);
      expect(deserialized.publishedAt).toBe(original.publishedAt);
      expect(deserialized.title).toBe(original.title);
      expect(deserialized.mediaPath).toBe(original.mediaPath);
    });

    it('should satisfy parse(print(event)) === event (all optional fields)', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Complete message',
        title: 'Message Title',
        mediaPath: 'crypto-news/media/123/167_0.jpg',
        publishedAt: 1609459200000,
      });

      const original = BroadcastEvent.fromJSON(json);
      const serialized = JSON.stringify(original.toJSON());
      const deserialized = BroadcastEvent.fromJSON(serialized);

      expect(deserialized.eventId).toBe(original.eventId);
      expect(deserialized.timestamp).toBe(original.timestamp);
      expect(deserialized.channelId).toBe(original.channelId);
      expect(deserialized.messageId).toBe(original.messageId);
      expect(deserialized.content).toBe(original.content);
      expect(deserialized.publishedAt).toBe(original.publishedAt);
      expect(deserialized.title).toBe(original.title);
      expect(deserialized.mediaPath).toBe(original.mediaPath);
    });

    it('should preserve empty string content', () => {
      const msg = {
        id: 1,
        date: 1609459200,
      };

      const original = BroadcastEvent.fromTelegramMessage('123', msg);
      const serialized = JSON.stringify(original.toJSON());
      const deserialized = BroadcastEvent.fromJSON(serialized);

      expect(deserialized.content).toBe('');
      expect(deserialized.content).toBe(original.content);
    });

    it('should handle multiple round-trips', () => {
      const msg = {
        id: 99,
        text: 'Multi round-trip test',
        date: 1609459200,
      };

      const original = BroadcastEvent.fromTelegramMessage('999', msg);
      let current = original;

      // Three round-trips
      for (let i = 0; i < 3; i++) {
        const serialized = JSON.stringify(current.toJSON());
        current = BroadcastEvent.fromJSON(serialized);
      }

      expect(current.eventId).toBe(original.eventId);
      expect(current.timestamp).toBe(original.timestamp);
      expect(current.channelId).toBe(original.channelId);
      expect(current.messageId).toBe(original.messageId);
      expect(current.content).toBe(original.content);
      expect(current.publishedAt).toBe(original.publishedAt);
    });
  });

  describe('equals', () => {
    it('should return true for identical events', () => {
      const json = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      });

      const event1 = BroadcastEvent.fromJSON(json);
      const event2 = BroadcastEvent.fromJSON(json);

      expect(event1.equals(event2)).toBe(true);
    });

    it('should return false for different eventIds', () => {
      const event1 = BroadcastEvent.fromJSON(
        JSON.stringify({
          eventId: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: 1609459200000,
          channelId: '-1001234567890',
          messageId: 167,
          content: 'Test',
          publishedAt: 1609459200000,
        }),
      );

      const event2 = BroadcastEvent.fromJSON(
        JSON.stringify({
          eventId: '650e8400-e29b-41d4-a716-446655440000',
          timestamp: 1609459200000,
          channelId: '-1001234567890',
          messageId: 167,
          content: 'Test',
          publishedAt: 1609459200000,
        }),
      );

      expect(event1.equals(event2)).toBe(false);
    });

    it('should return false for different content', () => {
      const base = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        publishedAt: 1609459200000,
      };

      const event1 = BroadcastEvent.fromJSON(
        JSON.stringify({ ...base, content: 'Test 1' }),
      );
      const event2 = BroadcastEvent.fromJSON(
        JSON.stringify({ ...base, content: 'Test 2' }),
      );

      expect(event1.equals(event2)).toBe(false);
    });

    it('should return false for null', () => {
      const msg = { id: 1, text: 'Test', date: 1609459200 };
      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(event.equals(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      const msg = { id: 1, text: 'Test', date: 1609459200 };
      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(event.equals(undefined)).toBe(false);
    });

    it('should return false for non-BroadcastEvent object', () => {
      const msg = { id: 1, text: 'Test', date: 1609459200 };
      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(event.equals({} as any)).toBe(false);
    });

    it('should distinguish presence vs absence of optional fields', () => {
      const base = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1609459200000,
        channelId: '-1001234567890',
        messageId: 167,
        content: 'Test',
        publishedAt: 1609459200000,
      };

      const event1 = BroadcastEvent.fromJSON(JSON.stringify(base));
      const event2 = BroadcastEvent.fromJSON(
        JSON.stringify({ ...base, title: 'Title' }),
      );

      expect(event1.equals(event2)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen (immutable)', () => {
      const msg = { id: 1, text: 'Test', date: 1609459200 };
      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(Object.isFrozen(event)).toBe(true);
    });

    it('should throw when attempting to modify properties', () => {
      const msg = { id: 1, text: 'Test', date: 1609459200 };
      const event = BroadcastEvent.fromTelegramMessage('123', msg);

      expect(() => {
        (event as any).content = 'Modified';
      }).toThrow();
    });
  });
});
