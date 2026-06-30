import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';

describe('CryptoNewsMessage', () => {
  describe('create()', () => {
    it('creates a message with all fields', () => {
      const msg = CryptoNewsMessage.create({
        channelId: '1234567890',
        messageId: 42,
        title: 'Breaking News',
        content: 'Bitcoin reached a new ATH today.',
        publishedAt: new Date('2026-01-01T12:00:00Z'),
      });
      expect(msg.channelId).toBe('1234567890');
      expect(msg.messageId).toBe(42);
      expect(msg.title).toBe('Breaking News');
      expect(msg.content).toBe('Bitcoin reached a new ATH today.');
      expect(msg.publishedAt.toISOString()).toBe('2026-01-01T12:00:00.000Z');
      expect(msg.ingestedAt).toBeInstanceOf(Date);
    });

    it('trims title or sets to null when empty', () => {
      const msg = CryptoNewsMessage.create({
        channelId: '123',
        messageId: 1,
        title: '  Spaced Title  ',
        content: 'body',
        publishedAt: new Date(),
      });
      expect(msg.title).toBe('Spaced Title');
    });

    it('accepts null title', () => {
      const msg = CryptoNewsMessage.create({
        channelId: '123',
        messageId: 1,
        title: null,
        content: 'body',
        publishedAt: new Date(),
      });
      expect(msg.title).toBeNull();
    });

    it('assigns a UUID on creation', () => {
      const msg1 = CryptoNewsMessage.create({
        channelId: '123',
        messageId: 1,
        title: null,
        content: 'body',
        publishedAt: new Date(),
      });
      const msg2 = CryptoNewsMessage.create({
        channelId: '123',
        messageId: 2,
        title: null,
        content: 'body',
        publishedAt: new Date(),
      });
      expect(msg1.id).not.toBe(msg2.id);
      expect(msg1.id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('rejects empty channelId', () => {
      expect(() =>
        CryptoNewsMessage.create({
          channelId: '',
          messageId: 1,
          title: null,
          content: 'body',
          publishedAt: new Date(),
        }),
      ).toThrow();
    });

    it('rejects negative messageId', () => {
      expect(() =>
        CryptoNewsMessage.create({
          channelId: '123',
          messageId: -1,
          title: null,
          content: 'body',
          publishedAt: new Date(),
        }),
      ).toThrow();
    });
  });

  describe('reconstitute()', () => {
    it('rehydrates from persistence shape', () => {
      const id = 'fixed-uuid';
      const ingestedAt = new Date('2026-01-02T00:00:00Z');
      const msg = CryptoNewsMessage.reconstitute({
        id,
        channelId: '123',
        messageId: 1,
        title: 'Test',
        content: 'body',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        ingestedAt,
      });
      expect(msg.id).toBe(id);
      expect(msg.ingestedAt).toBe(ingestedAt);
    });
  });
});
