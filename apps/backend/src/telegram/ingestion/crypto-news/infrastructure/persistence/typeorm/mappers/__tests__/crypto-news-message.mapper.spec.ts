import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMedia } from 'telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo';
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

  it('round-trips with a single photo', () => {
    const photo = CryptoNewsMedia.create({
      index: 0,
      type: 'photo',
      filePath: '/tmp/news/abc-0.jpg',
      mimeType: 'image/jpeg',
      fileSize: 102400,
    });
    const msg = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 10,
      title: 'Has photo',
      content: 'body',
      publishedAt: new Date('2026-02-02T08:00:00Z'),
      media: [photo],
    });

    const entity = CryptoNewsMessageMapper.toEntity(msg);
    expect(entity.media).toHaveLength(1);
    expect(entity.media[0].index).toBe(0);
    expect(entity.media[0].type).toBe('photo');
    expect(entity.media[0].filePath).toBe('/tmp/news/abc-0.jpg');
    expect(entity.media[0].mimeType).toBe('image/jpeg');
    expect(entity.media[0].fileSize).toBe(102400);
    // FK / id / createdAt left for TypeORM/DB to populate.
    expect(entity.media[0].id).toBeUndefined();

    const back = CryptoNewsMessageMapper.toDomain(entity);
    expect(back.media).toHaveLength(1);
    expect(back.media[0].index).toBe(0);
    expect(back.media[0].type).toBe('photo');
    expect(back.media[0].filePath).toBe('/tmp/news/abc-0.jpg');
    expect(back.media[0].mimeType).toBe('image/jpeg');
    expect(back.media[0].fileSize).toBe(102400);
  });

  it('round-trips with a single webpage link preview', () => {
    const webpage = CryptoNewsMedia.create({
      index: 0,
      type: 'webpage',
      filePath: '/tmp/news/x-0.jpg',
      mimeType: 'image/jpeg',
      fileSize: 102400,
    });
    const msg = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 12,
      title: 'Has webpage',
      content: 'body',
      publishedAt: new Date('2026-06-06T08:00:00Z'),
      media: [webpage],
    });

    const entity = CryptoNewsMessageMapper.toEntity(msg);
    expect(entity.media).toHaveLength(1);
    expect(entity.media[0].index).toBe(0);
    expect(entity.media[0].type).toBe('webpage');
    expect(entity.media[0].filePath).toBe('/tmp/news/x-0.jpg');
    expect(entity.media[0].mimeType).toBe('image/jpeg');
    expect(entity.media[0].fileSize).toBe(102400);
    // FK / id / createdAt left for TypeORM/DB to populate.
    expect(entity.media[0].id).toBeUndefined();

    const back = CryptoNewsMessageMapper.toDomain(entity);
    expect(back.media).toHaveLength(1);
    expect(back.media[0].index).toBe(0);
    expect(back.media[0].type).toBe('webpage');
    expect(back.media[0].filePath).toBe('/tmp/news/x-0.jpg');
    expect(back.media[0].mimeType).toBe('image/jpeg');
    expect(back.media[0].fileSize).toBe(102400);
  });

  it('round-trips with multiple photos preserving order', () => {
    const photos = [
      CryptoNewsMedia.create({
        index: 0,
        type: 'photo',
        filePath: '/tmp/news/multi-0.png',
        mimeType: 'image/png',
        fileSize: 204800,
      }),
      CryptoNewsMedia.create({
        index: 1,
        type: 'photo',
        filePath: '/tmp/news/multi-1.jpg',
        mimeType: 'image/jpeg',
        fileSize: 307200,
      }),
      CryptoNewsMedia.create({
        index: 2,
        type: 'photo',
        filePath: '/tmp/news/multi-2.jpg',
        mimeType: 'image/jpeg',
        fileSize: 409600,
      }),
    ];
    const msg = CryptoNewsMessage.create({
      channelId: '777',
      messageId: 99,
      title: 'Album',
      content: 'multi-photo body',
      publishedAt: new Date('2026-03-03T10:00:00Z'),
      media: photos,
    });

    const entity = CryptoNewsMessageMapper.toEntity(msg);
    expect(entity.media).toHaveLength(3);
    expect(entity.media.map((m) => m.index)).toEqual([0, 1, 2]);
    expect(entity.media.map((m) => m.filePath)).toEqual([
      '/tmp/news/multi-0.png',
      '/tmp/news/multi-1.jpg',
      '/tmp/news/multi-2.jpg',
    ]);
    expect(entity.media[1].mimeType).toBe('image/jpeg');

    const back = CryptoNewsMessageMapper.toDomain(entity);
    expect(back.media).toHaveLength(3);
    expect(back.media.map((m) => m.index)).toEqual([0, 1, 2]);
    expect(back.media.map((m) => m.fileSize)).toEqual([204800, 307200, 409600]);
  });

  it('round-trips without media (backward compat — media defaults to [])', () => {
    const msg = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 7,
      title: 'No photos',
      content: 'plain text body',
      publishedAt: new Date('2026-04-04T12:00:00Z'),
    });
    expect(msg.media).toEqual([]);

    const entity = CryptoNewsMessageMapper.toEntity(msg);
    expect(entity.media).toEqual([]);

    const back = CryptoNewsMessageMapper.toDomain(entity);
    expect(back.media).toEqual([]);
  });

  it('preserves null mimeType through the mapping', () => {
    const photo = CryptoNewsMedia.create({
      index: 0,
      type: 'photo',
      filePath: '/tmp/news/sniffed.bin',
      mimeType: null,
      fileSize: 512,
    });
    const msg = CryptoNewsMessage.create({
      channelId: '123',
      messageId: 11,
      title: 'Unknown mime',
      content: 'sniffed body',
      publishedAt: new Date('2026-05-05T09:00:00Z'),
      media: [photo],
    });

    expect(msg.media[0].mimeType).toBeNull();

    const entity = CryptoNewsMessageMapper.toEntity(msg);
    expect(entity.media[0].mimeType).toBeNull();

    const back = CryptoNewsMessageMapper.toDomain(entity);
    expect(back.media[0].mimeType).toBeNull();
    expect(back.media[0].fileSize).toBe(512);
  });
});
