import { Repository } from 'typeorm';
import { TypeOrmAdMediaRepository } from '../typeorm-ad-media.repository';
import { AdMediaEntity } from '../../entities/ad-media.entity';

describe('TypeOrmAdMediaRepository', () => {
  let repo: TypeOrmAdMediaRepository;
  let mockRepo: jest.Mocked<Repository<AdMediaEntity>>;

  const makeEntity = (overrides: Partial<AdMediaEntity> = {}): AdMediaEntity =>
    ({
      id: 'media-1',
      adId: 'ad-1',
      filePath: '/uploads/crypto-news-ads/ad-1/abc123.png',
      mimeType: 'image/png',
      fileSize: 4096,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
      ...overrides,
    }) as AdMediaEntity;

  beforeEach(() => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<AdMediaEntity>>;
    repo = new TypeOrmAdMediaRepository(mockRepo);
  });

  describe('save', () => {
    it('round-trips a record through the entity back to a mapped record', async () => {
      const record = {
        id: 'media-1',
        adId: 'ad-1',
        filePath: '/uploads/crypto-news-ads/ad-1/abc123.png',
        mimeType: 'image/png',
        fileSize: 4096,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      };
      mockRepo.save.mockResolvedValue(makeEntity());
      const result = await repo.save(record);
      expect(result).toEqual(record);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('maps nullable columns to null via ?? null', async () => {
      const record = {
        id: 'media-2',
        adId: 'ad-2',
        filePath: '/uploads/crypto-news-ads/ad-2/legacy.jpg',
        mimeType: null,
        fileSize: null,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      };
      mockRepo.save.mockResolvedValue(
        makeEntity({
          id: 'media-2',
          adId: 'ad-2',
          mimeType: null,
          fileSize: null,
        }),
      );
      const result = await repo.save(record);
      expect(result.mimeType).toBeNull();
      expect(result.fileSize).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns null when no row matches', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });

    it('maps a hit row to a record', async () => {
      mockRepo.findOne.mockResolvedValue(makeEntity());
      const result = await repo.findById('media-1');
      expect(result).toEqual({
        id: 'media-1',
        adId: 'ad-1',
        filePath: '/uploads/crypto-news-ads/ad-1/abc123.png',
        mimeType: 'image/png',
        fileSize: 4096,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      });
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'media-1' },
      });
    });
  });

  describe('findByAdId', () => {
    it('returns null when the ad has no media row', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findByAdId('ad-1')).toBeNull();
    });

    it('returns the single row for an ad (UNIQUE ad_id)', async () => {
      mockRepo.findOne.mockResolvedValue(makeEntity());
      const result = await repo.findByAdId('ad-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('media-1');
      expect(result!.adId).toBe('ad-1');
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { adId: 'ad-1' },
      });
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 } as never);
      await repo.delete('media-1');
      expect(mockRepo.delete).toHaveBeenCalledWith('media-1');
    });
  });

  describe('deleteByAdId', () => {
    it('deletes by adId', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 } as never);
      await repo.deleteByAdId('ad-1');
      expect(mockRepo.delete).toHaveBeenCalledWith({ adId: 'ad-1' });
    });

    it('returns without error when delete resolves undefined (0 rows)', async () => {
      mockRepo.delete.mockResolvedValue(undefined as never);
      await expect(repo.deleteByAdId('ad-1')).resolves.toBeUndefined();
    });
  });
});
