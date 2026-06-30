import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsSourceEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { CryptoNewsSourceMapper } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/crypto-news-source.mapper';

describe('CryptoNewsSourceMapper', () => {
  it('round-trips domain → entity → domain', () => {
    const source = CryptoNewsSource.create({
      channelId: '1234567890',
      handle: '@cryptosource',
      title: 'Crypto News Daily',
    });
    source.activate();
    const entity = CryptoNewsSourceMapper.toEntity(source);
    expect(entity.channelId).toBe('1234567890');
    expect(entity.handle).toBe('@cryptosource');
    expect(entity.title).toBe('Crypto News Daily');
    expect(entity.isActive).toBe(true);
    expect(entity.lifecycleStatus).toBe('ACTIVE');

    const back = CryptoNewsSourceMapper.toDomain(entity);
    expect(back.channelId).toBe(source.channelId);
    expect(back.handle).toBe(source.handle);
    expect(back.title).toBe(source.title);
    expect(back.isActive).toBe(source.isActive);
    expect(back.lifecycleStatus).toBe(source.lifecycleStatus);
  });

  it('handles null handle', () => {
    const source = CryptoNewsSource.create({
      channelId: '123',
      handle: null,
      title: 'No handle',
    });
    const entity = CryptoNewsSourceMapper.toEntity(source);
    expect(entity.handle).toBeNull();
    const back = CryptoNewsSourceMapper.toDomain(entity);
    expect(back.handle).toBeNull();
  });
});
