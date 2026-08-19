import { ReuseLibraryImagesUseCase } from '../reuse-library-images.use-case';
import { ErrorCode } from 'shared/kernel/domain-error';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import {
  AdMediaRecord,
  AdMediaRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import {
  AdMediaLibraryRecord,
  AdMediaLibraryRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';

/**
 * Real PNG magic bytes (8 bytes) — enough for `detectMediaMimeType`'s
 * `sniffMimeFromBytes` (which only reads the first 4 bytes for PNG).
 */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngBuffer(size = 1024): Buffer {
  return Buffer.concat([
    PNG_MAGIC,
    Buffer.alloc(Math.max(0, size - PNG_MAGIC.length)),
  ]);
}

function libraryRecord(
  id: string,
  overrides: Partial<AdMediaLibraryRecord> = {},
): AdMediaLibraryRecord {
  const record: AdMediaLibraryRecord = {
    id,
    filePath: `crypto-news-ads-library/${id}.png`,
    contentHash: id,
    originalFileName: `${id}.png`,
    mimeType: 'image/png',
    fileSize: 1024,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  return { ...record, ...overrides };
}

describe('ReuseLibraryImagesUseCase', () => {
  let useCase: ReuseLibraryImagesUseCase;
  const adRepo = {
    findById: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<AdRepository>;
  const adMediaRepo = {
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<AdMediaRepository>;
  const libraryRepo = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<AdMediaLibraryRepository>;
  const storage = {
    store: jest.fn(),
    remove: jest.fn(),
    storeLibraryFile: jest.fn(),
    readFile: jest.fn(),
  } as unknown as jest.Mocked<AdMediaStoragePort>;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ReuseLibraryImagesUseCase(
      adRepo,
      adMediaRepo,
      libraryRepo,
      storage,
    );
  });

  it('clones multiple library images, saves media rows + rebuilt ad, returns a view with albumMediaIds', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    libraryRepo.findById.mockImplementation(async (id: string) =>
      libraryRecord(id),
    );
    storage.readFile.mockResolvedValue(pngBuffer());
    storage.store.mockImplementation(async (_adId, _buffer, mimeType) => ({
      relativePath: `crypto-news-ads/ad-1/uuid${mimeType === 'image/png' ? '.png' : '.jpg'}`,
      size: 1024,
    }));
    adMediaRepo.save.mockImplementation(async (media) => media);

    const view = await useCase.execute({
      adId: 'ad-1',
      libraryMediaIds: ['lib-1', 'lib-2'],
    });

    expect(libraryRepo.findById).toHaveBeenCalledTimes(2);
    expect(storage.readFile).toHaveBeenCalledTimes(2);
    expect(adMediaRepo.save).toHaveBeenCalledTimes(2);
    const savedIds = adMediaRepo.save.mock.calls.map(([media]) => media.id);
    expect(savedIds).toHaveLength(2);

    expect(adRepo.save).toHaveBeenCalledTimes(1);
    const savedAd = adRepo.save.mock.calls[0][0];
    expect(savedAd.albumMediaIds).toEqual(savedIds);
    expect(view.albumMediaIds).toEqual(savedIds);

    expect(storage.remove).not.toHaveBeenCalled();
    expect(adMediaRepo.delete).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the ad does not exist', async () => {
    adRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ adId: 'missing', libraryMediaIds: ['lib-1'] }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Ad missing not found',
    });
    expect(libraryRepo.findById).not.toHaveBeenCalled();
    expect(storage.readFile).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when a library id is missing, before writing anything', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    libraryRepo.findById.mockImplementation(async (id: string) =>
      id === 'lib-1' ? libraryRecord('lib-1') : null,
    );

    await expect(
      useCase.execute({
        adId: 'ad-1',
        libraryMediaIds: ['lib-1', 'missing-lib'],
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Library media missing-lib not found',
    });
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('maps an ENOENT file read to NOT_FOUND (library file missing on disk)', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    libraryRepo.findById.mockResolvedValue(libraryRecord('lib-1'));
    const enoent = new Error('no such file');
    (enoent as NodeJS.ErrnoException).code = 'ENOENT';
    storage.readFile.mockRejectedValue(enoent);

    await expect(
      useCase.execute({ adId: 'ad-1', libraryMediaIds: ['lib-1'] }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'library file missing on disk',
    });
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a non-image library buffer with VALIDATION, before writing anything', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    libraryRepo.findById.mockImplementation(async (id: string) =>
      libraryRecord(id, {
        filePath: `crypto-news-ads-library/${id}.bin`,
        mimeType: 'application/octet-stream',
      }),
    );
    storage.readFile.mockResolvedValue(Buffer.from('hello world'));

    await expect(
      useCase.execute({ adId: 'ad-1', libraryMediaIds: ['lib-1'] }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message: 'only image files are allowed',
    });
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('replaces an existing album: old files removed + old rows deleted only AFTER the new saves', async () => {
    const oldMedia: AdMediaRecord[] = [
      {
        id: 'old-1',
        adId: 'ad-1',
        filePath: 'crypto-news-ads/ad-1/old-1.png',
        mimeType: 'image/png',
        fileSize: 512,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'old-2',
        adId: 'ad-1',
        filePath: 'crypto-news-ads/ad-1/old-2.png',
        mimeType: 'image/png',
        fileSize: 512,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];
    const ad = Ad.create({
      id: 'ad-1',
      name: 'Sponsor',
      body: 'promo',
      format: 'album',
      albumMediaIds: ['old-1', 'old-2'],
    });
    adRepo.findById.mockResolvedValue(ad);
    adMediaRepo.findById.mockImplementation(
      async (id: string) => oldMedia.find((m) => m.id === id) ?? null,
    );
    libraryRepo.findById.mockImplementation(async (id: string) =>
      libraryRecord(id),
    );
    storage.readFile.mockResolvedValue(pngBuffer());
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/new.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    await useCase.execute({
      adId: 'ad-1',
      libraryMediaIds: ['lib-1', 'lib-2'],
    });

    expect(adMediaRepo.save).toHaveBeenCalledTimes(2);
    const savedIds = adMediaRepo.save.mock.calls.map(([media]) => media.id);
    expect(adRepo.save).toHaveBeenCalledTimes(1);
    expect(adRepo.save.mock.calls[0][0].albumMediaIds).toEqual(savedIds);
    expect(adRepo.save.mock.calls[0][0].albumMediaIds).not.toContain('old-1');
    expect(adRepo.save.mock.calls[0][0].albumMediaIds).not.toContain('old-2');

    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(adMediaRepo.delete).toHaveBeenCalledTimes(2);

    const newMediaSaveAt = (adMediaRepo.save as jest.Mock).mock
      .invocationCallOrder[0];
    const newAdSaveAt = (adRepo.save as jest.Mock).mock.invocationCallOrder[0];
    const oldRemoveAt = (storage.remove as jest.Mock).mock
      .invocationCallOrder[0];
    const oldDeleteAt = (adMediaRepo.delete as jest.Mock).mock
      .invocationCallOrder[0];
    expect(oldRemoveAt).toBeGreaterThan(newMediaSaveAt);
    expect(oldRemoveAt).toBeGreaterThan(newAdSaveAt);
    expect(oldDeleteAt).toBeGreaterThan(newMediaSaveAt);
    expect(oldDeleteAt).toBeGreaterThan(newAdSaveAt);
  });
});
