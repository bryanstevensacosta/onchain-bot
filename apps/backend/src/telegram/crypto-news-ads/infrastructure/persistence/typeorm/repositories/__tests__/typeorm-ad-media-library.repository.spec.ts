import { Repository } from 'typeorm';
import { TypeOrmAdMediaLibraryRepository } from '../typeorm-ad-media-library.repository';
import { AdMediaLibraryEntity } from '../../entities/ad-media-library.entity';

describe('TypeOrmAdMediaLibraryRepository', () => {
  let repo: TypeOrmAdMediaLibraryRepository;
  let mockRepo: jest.Mocked<Repository<AdMediaLibraryEntity>>;

  const makeEntity = (
    overrides: Partial<AdMediaLibraryEntity> = {},
  ): AdMediaLibraryEntity => ({
    id: 'lib-1',
    filePath: '/uploads/crypto-news-ads-library/abc123.png',
    contentHash: 'abc123',
    originalFileName: 'banner.png',
    mimeType: 'image/png',
    fileSize: 4096,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<AdMediaLibraryEntity>>;
    repo = new TypeOrmAdMediaLibraryRepository(mockRepo);
  });

  describe('save', () => {
    it('round-trips a record through the entity back to a mapped record', async () => {
      const record = {
        id: 'lib-1',
        filePath: '/uploads/crypto-news-ads-library/abc123.png',
        contentHash: 'abc123',
        originalFileName: 'banner.png',
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
        id: 'lib-2',
        filePath: '/uploads/crypto-news-ads-library/legacy.jpg',
        contentHash: 'legacy',
        originalFileName: null,
        mimeType: null,
        fileSize: null,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      };
      mockRepo.save.mockResolvedValue(
        makeEntity({
          id: 'lib-2',
          originalFileName: null,
          mimeType: null,
          fileSize: null,
        }),
      );
      const result = await repo.save(record);
      expect(result.originalFileName).toBeNull();
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
      const result = await repo.findById('lib-1');
      expect(result).toEqual({
        id: 'lib-1',
        filePath: '/uploads/crypto-news-ads-library/abc123.png',
        contentHash: 'abc123',
        originalFileName: 'banner.png',
        mimeType: 'image/png',
        fileSize: 4096,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      });
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'lib-1' },
      });
    });
  });

  describe('findByContentHash', () => {
    it('returns null on a content-hash miss', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findByContentHash('unknown-hash')).toBeNull();
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { contentHash: 'unknown-hash' },
      });
    });

    it('returns the row on a content-hash hit', async () => {
      mockRepo.findOne.mockResolvedValue(makeEntity());
      const result = await repo.findByContentHash('abc123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('lib-1');
      expect(result!.contentHash).toBe('abc123');
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { contentHash: 'abc123' },
      });
    });
  });

  describe('findAll', () => {
    it('orders rows by createdAt DESC and maps them to records', async () => {
      const newer = makeEntity({
        id: 'lib-new',
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      });
      const older = makeEntity({
        id: 'lib-old',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      });
      mockRepo.find.mockResolvedValue([newer, older]);
      const result = await repo.findAll();
      expect(mockRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'lib-new',
        filePath: '/uploads/crypto-news-ads-library/abc123.png',
        contentHash: 'abc123',
        originalFileName: 'banner.png',
        mimeType: 'image/png',
        fileSize: 4096,
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      });
      expect(result[1].id).toBe('lib-old');
    });

    it('returns an empty array when no rows exist', async () => {
      mockRepo.find.mockResolvedValue([]);
      expect(await repo.findAll()).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1 } as never);
      await repo.delete('lib-1');
      expect(mockRepo.delete).toHaveBeenCalledWith('lib-1');
    });

    it('resolves without error when the id is unknown (0 rows affected)', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 0 } as never);
      await expect(repo.delete('missing')).resolves.toBeUndefined();
    });

    it('resolves without error when delete resolves undefined', async () => {
      mockRepo.delete.mockResolvedValue(undefined as never);
      await expect(repo.delete('missing')).resolves.toBeUndefined();
    });
  });
});
