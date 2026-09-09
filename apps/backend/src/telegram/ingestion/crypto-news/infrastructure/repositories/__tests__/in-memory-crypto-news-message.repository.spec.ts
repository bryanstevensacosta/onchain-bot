import { CryptoNewsMessage } from '../../../domain/crypto-news-message.stub';
import { InMemoryCryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-message.repository';

describe('InMemoryCryptoNewsMessageRepository', () => {
  let repo: InMemoryCryptoNewsMessageRepository;

  beforeEach(() => {
    repo = new InMemoryCryptoNewsMessageRepository();
  });

  it('should be defined', () => {
    expect(repo).toBeDefined();
  });

  describe('save and findById', () => {
    it('should save a message and retrieve it by id', async () => {
      const message: CryptoNewsMessage = {
        id: 'test-channel:123',
        channelId: 'test-channel',
        messageId: 123,
        content: 'Test message content',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01'),
        media: [],
      };

      await repo.save(message);

      const found = await repo.findById('test-channel:123');
      expect(found).toEqual(message);
    });

    it('should return null for non-existent id', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findRecent', () => {
    it('should return messages sorted by ingestedAt descending', async () => {
      const msg1: CryptoNewsMessage = {
        id: '1',
        channelId: 'ch1',
        messageId: 1,
        content: 'msg1',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01T10:00:00Z'),
        media: [],
      };
      const msg2: CryptoNewsMessage = {
        id: '2',
        channelId: 'ch1',
        messageId: 2,
        content: 'msg2',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01T12:00:00Z'),
        media: [],
      };

      await repo.save(msg1);
      await repo.save(msg2);

      const recent = await repo.findRecent(10);
      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('2'); // Most recent first
      expect(recent[1].id).toBe('1');
    });

    it('should filter by since date', async () => {
      const msg1: CryptoNewsMessage = {
        id: '1',
        channelId: 'ch1',
        messageId: 1,
        content: 'msg1',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01T10:00:00Z'),
        media: [],
      };
      const msg2: CryptoNewsMessage = {
        id: '2',
        channelId: 'ch1',
        messageId: 2,
        content: 'msg2',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01T12:00:00Z'),
        media: [],
      };

      await repo.save(msg1);
      await repo.save(msg2);

      const recent = await repo.findRecent(
        10,
        new Date('2024-01-01T11:00:00Z'),
      );
      expect(recent).toHaveLength(1);
      expect(recent[0].id).toBe('2');
    });
  });

  describe('findByChannelId', () => {
    it('should return messages for specific channel', async () => {
      const msg1: CryptoNewsMessage = {
        id: '1',
        channelId: 'ch1',
        messageId: 1,
        content: 'msg1',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01'),
        media: [],
      };
      const msg2: CryptoNewsMessage = {
        id: '2',
        channelId: 'ch2',
        messageId: 2,
        content: 'msg2',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01'),
        media: [],
      };

      await repo.save(msg1);
      await repo.save(msg2);

      const found = await repo.findByChannelId('ch1', 10);
      expect(found).toHaveLength(1);
      expect(found[0].channelId).toBe('ch1');
    });
  });

  describe('findByChannelAndMessageId', () => {
    it('should find message by channel and message id', async () => {
      const message: CryptoNewsMessage = {
        id: 'ch1:123',
        channelId: 'ch1',
        messageId: 123,
        content: 'test',
        publishedAt: new Date('2024-01-01'),
        ingestedAt: new Date('2024-01-01'),
        media: [],
      };

      await repo.save(message);

      const found = await repo.findByChannelAndMessageId('ch1', 123);
      expect(found).toEqual(message);
    });

    it('should return null when not found', async () => {
      const found = await repo.findByChannelAndMessageId('ch1', 999);
      expect(found).toBeNull();
    });
  });
});
