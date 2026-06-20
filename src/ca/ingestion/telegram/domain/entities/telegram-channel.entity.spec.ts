import { TelegramChannel } from 'ca/ingestion/telegram/domain/entities/telegram-channel.entity';
import { ChannelId } from 'ca/ingestion/telegram/domain/value-objects/channel-id.vo';
import { ChannelUsername } from 'ca/ingestion/telegram/domain/value-objects/channel-username.vo';
import { DomainError } from 'shared/kernel/domain-error';

describe('TelegramChannel', () => {
  const id = ChannelId.fromString('1234567890');
  const username = ChannelUsername.fromString('SpyDefi');

  describe('create', () => {
    it('creates a channel with isActive=false and lastIngestedAt=null', () => {
      const channel = TelegramChannel.create({
        id,
        username,
        title: 'SpyDefi',
      });

      expect(channel.channelId.equals(id)).toBe(true);
      expect(channel.username?.equals(username)).toBe(true);
      expect(channel.title).toBe('SpyDefi');
      expect(channel.isActive).toBe(false);
      expect(channel.lastIngestedAt).toBeNull();
    });

    it('trims the title', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: '   SpyDefi  ',
      });
      expect(channel.title).toBe('SpyDefi');
    });

    it('rejects empty title', () => {
      expect(() =>
        TelegramChannel.create({ id, username: null, title: '   ' }),
      ).toThrow(DomainError);
    });
  });

  describe('startListening', () => {
    it('sets isActive=true', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      channel.startListening();
      expect(channel.isActive).toBe(true);
    });

    it('is idempotent', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      channel.startListening();
      channel.startListening();
      expect(channel.isActive).toBe(true);
    });

    it('emits a MessageIngestedEvent', () => {
      const channel = TelegramChannel.create({
        id,
        username,
        title: 'SpyDefi',
      });
      channel.startListening();
      const events = channel.commit();
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('telegram.message.ingested');
    });
  });

  describe('stopListening', () => {
    it('sets isActive=false', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      channel.startListening();
      channel.stopListening();
      expect(channel.isActive).toBe(false);
    });
  });

  describe('updateTitle', () => {
    it('replaces the title when non-empty and different', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'Telegram channel 1234567890',
      });
      channel.updateTitle('Real Channel Name');
      expect(channel.title).toBe('Real Channel Name');
    });

    it('trims whitespace from the new title', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'Old',
      });
      channel.updateTitle('  Padded  ');
      expect(channel.title).toBe('Padded');
    });

    it('is a no-op when the title is the same', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      channel.updateTitle('SpyDefi');
      expect(channel.title).toBe('SpyDefi');
    });

    it('rejects empty title', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      expect(() => channel.updateTitle('   ')).toThrow(DomainError);
    });

    it('does not emit a domain event', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'Old',
      });
      channel.commit();
      channel.updateTitle('New');
      expect(channel.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('recordMessageIngested', () => {
    it('updates lastIngestedAt and emits event', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      const at = new Date('2024-01-01T00:00:00Z');
      channel.recordMessageIngested(42, at);
      expect(channel.lastIngestedAt?.toISOString()).toBe(
        '2024-01-01T00:00:00.000Z',
      );
      const events = channel.commit();
      expect(events).toHaveLength(1);
      const payload = events[0].toPayload();
      expect(payload.messageId).toBe(42);
    });
  });

  describe('domain events', () => {
    it('commits returns events and clears them', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      channel.startListening();
      channel.recordMessageIngested(1, new Date());
      expect(channel.getUncommittedEvents()).toHaveLength(2);
      const events = channel.commit();
      expect(events).toHaveLength(2);
      expect(channel.getUncommittedEvents()).toHaveLength(0);
    });

    it('uncommit discards pending events', () => {
      const channel = TelegramChannel.create({
        id,
        username: null,
        title: 'SpyDefi',
      });
      channel.startListening();
      channel.uncommit();
      expect(channel.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
