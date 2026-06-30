import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMapper } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/crypto-news-message.mapper';

describe('CryptoNewsMessageMapper', () => {
  it('round-trips domain → entity → domain', () => {
    const msg = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 42,
      title: 'Title',
      content: 'body content',
      publishedAt: new Date('2026-01-01T12:00:00Z'),
    });
    const entity = CryptoNewsMessageMapper.toEntity(msg);
    expect(entity.id).toBe(msg.id);
    expect(entity.channelId).toBe('123');
    expect(entity.messageId).toBe(42);
    expect(entity.title).toBe('Title');
    expect(entity.content).toBe('body content');
    expect(entity.publishedAt.toISOString()).toBe('2026-01-01T12:00:00.000Z');

    const back = CryptoNewsMessageMapper.toDomain(entity);
    expect(back.id).toBe(msg.id);
    expect(back.channelId).toBe(msg.channelId);
    expect(back.content).toBe('body content');
  });

  it('handles null title', () => {
    const msg = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 1,
      title: null,
      content: 'body',
      publishedAt: new Date(),
    });
    const entity = CryptoNewsMessageMapper.toEntity(msg);
    expect(entity.title).toBeNull();
    const back = CryptoNewsMessageMapper.toDomain(entity);
    expect(back.title).toBeNull();
  });
});
