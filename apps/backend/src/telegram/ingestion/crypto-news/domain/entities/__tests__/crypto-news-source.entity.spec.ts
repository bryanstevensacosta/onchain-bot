import { DomainError } from 'shared/kernel/domain-error';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import { CryptoNewsSourceSeededEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-source-seeded.event';

describe('CryptoNewsSource', () => {
  describe('create()', () => {
    it('rejects non-numeric channelId', () => {
      expect(() =>
        CryptoNewsSource.create({
          channelId: 'not-a-number',
          handle: null,
          title: 'Test',
        }),
      ).toThrow(DomainError);
    });

    it('rejects empty title', () => {
      expect(() =>
        CryptoNewsSource.create({
          channelId: '1234567890',
          handle: null,
          title: '   ',
        }),
      ).toThrow(DomainError);
    });

    it('creates a valid source with ACTIVE lifecycle', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: '@cryptosource',
        title: 'Crypto News Daily',
      });
      expect(source.channelId).toBe('1234567890');
      expect(source.handle).toBe('@cryptosource');
      expect(source.title).toBe('Crypto News Daily');
      expect(source.isActive).toBe(false);
      expect(source.lifecycleStatus).toBe('ACTIVE');
    });

    it('emits a CryptoNewsSourceSeededEvent on creation', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: '@cryptosource',
        title: 'Crypto News Daily',
      });
      const events = source.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CryptoNewsSourceSeededEvent);
    });

    it('commit() returns and clears events', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: null,
        title: 'Test',
      });
      const events = source.commit();
      expect(events).toHaveLength(1);
      expect(source.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('lifecycle', () => {
    it('activate() sets status to ACTIVE and isActive to true', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: null,
        title: 'Test',
      });
      source.deactivate();
      expect(source.isActive).toBe(false);
      expect(source.lifecycleStatus).toBe('INACTIVE');
      source.activate();
      expect(source.isActive).toBe(true);
      expect(source.lifecycleStatus).toBe('ACTIVE');
    });

    it('deactivate() sets status to INACTIVE and isActive to false', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: null,
        title: 'Test',
      });
      source.deactivate();
      expect(source.isActive).toBe(false);
      expect(source.lifecycleStatus).toBe('INACTIVE');
    });
  });

  describe('updateTitle()', () => {
    it('updates title when different', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: null,
        title: 'Old Title',
      });
      source.updateTitle('New Title');
      expect(source.title).toBe('New Title');
    });

    it('rejects empty title', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: null,
        title: 'Test',
      });
      expect(() => source.updateTitle('   ')).toThrow(DomainError);
    });

    it('no-ops when title is the same (after trim)', () => {
      const source = CryptoNewsSource.create({
        channelId: '1234567890',
        handle: null,
        title: 'Test',
      });
      source.updateTitle('  Test  ');
      expect(source.title).toBe('Test');
    });
  });

  describe('reconstitute()', () => {
    it('rehydrates without applying invariants', () => {
      const source = CryptoNewsSource.reconstitute({
        channelId: '1234567890',
        handle: null,
        title: 'Test',
        isActive: true,
        lifecycleStatus: 'ACTIVE',
        addedAt: new Date('2026-01-01'),
      });
      expect(source.channelId).toBe('1234567890');
      expect(source.isActive).toBe(true);
      // reconstitute does NOT emit events
      expect(source.getUncommittedEvents()).toHaveLength(0);
    });
  });
});

describe('CryptoNewsMessageIngestedEvent', () => {
  it('carries no raw content (fix-1 compliance)', () => {
    const event = new CryptoNewsMessageIngestedEvent({
      channelId: '1234567890',
      messageId: 42,
      title: 'Bitcoin hits $100k',
      occurredAt: new Date('2026-01-01T00:00:00Z'),
    });
    const payload = event.toPayload();
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('text');
    expect(payload).toEqual({
      channelId: '1234567890',
      messageId: 42,
      title: 'Bitcoin hits $100k',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('uses naming convention crypto-news.message.ingested', () => {
    const event = new CryptoNewsMessageIngestedEvent({
      channelId: '123',
      messageId: 1,
      title: null,
      occurredAt: new Date(),
    });
    expect(event.eventName).toBe('crypto-news.message.ingested');
  });
});
