import { ReuseLibraryImageUseCase } from '../reuse-library-image.use-case';
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

function libraryRecord(overrides: Partial<AdMediaLibraryRecord> = {}) {
  const record: AdMediaLibraryRecord = {
    id: 'lib-1',
    filePath: 'crypto-news-ads-library/abc.png',
    contentHash: 'abc',
    originalFileName: 'banner.png',
    mimeType: 'image/png',
    fileSize: 1024,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  return { ...record, ...overrides };
}

describe('ReuseLibraryImageUseCase', () => {
  let useCase: ReuseLibraryImageUseCase;
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
    useCase = new ReuseLibraryImageUseCase(
      adRepo,
      adMediaRepo,
      libraryRepo,
      storage,
    );
  });

  it('clones a library image: reads the file, stores it for the ad, saves media row + rebuilt ad, returns a view', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    libraryRepo.findById.mockResolvedValue(libraryRecord());
    const buffer = pngBuffer();
    storage.readFile.mockResolvedValue(buffer);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    const view = await useCase.execute({
      adId: 'ad-1',
      libraryMediaId: 'lib-1',
    });

    expect(storage.readFile).toHaveBeenCalledWith(
      'crypto-news-ads-library/abc.png',
    );
    expect(storage.store).toHaveBeenCalledWith('ad-1', buffer, 'image/png');
    expect(adMediaRepo.save).toHaveBeenCalledTimes(1);
    const savedMedia = adMediaRepo.save.mock.calls[0][0];
    expect(savedMedia.adId).toBe('ad-1');
    expect(savedMedia.filePath).toBe('crypto-news-ads/ad-1/uuid.png');
    expect(savedMedia.mimeType).toBe('image/png');
    expect(savedMedia.fileSize).toBe(1024);
    expect(savedMedia.id).toEqual(expect.any(String));

    expect(adRepo.save).toHaveBeenCalledTimes(1);
    const savedAd = adRepo.save.mock.calls[0][0];
    expect(savedAd.id).toBe('ad-1');
    expect(savedAd.imageMediaId).toBe(savedMedia.id);
    expect(view.imageMediaId).toBe(savedMedia.id);

    expect(storage.remove).not.toHaveBeenCalled();
    expect(adMediaRepo.delete).not.toHaveBeenCalled();
  });

  it('replaces an existing image: old file removed + old row deleted only AFTER the new saves', async () => {
    const oldMedia: AdMediaRecord = {
      id: 'old-media-1',
      adId: 'ad-1',
      filePath: 'crypto-news-ads/ad-1/old-file.png',
      mimeType: 'image/png',
      fileSize: 512,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const ad = Ad.create({
      id: 'ad-1',
      name: 'Sponsor',
      body: 'promo',
      imageMediaId: oldMedia.id,
    });
    adRepo.findById.mockResolvedValue(ad);
    adMediaRepo.findById.mockResolvedValue(oldMedia);
    libraryRepo.findById.mockResolvedValue(libraryRecord());
    storage.readFile.mockResolvedValue(pngBuffer());
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/new-file.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    await useCase.execute({ adId: 'ad-1', libraryMediaId: 'lib-1' });

    // New row + new ad save happened.
    expect(adMediaRepo.save).toHaveBeenCalledTimes(1);
    const savedMedia = adMediaRepo.save.mock.calls[0][0];
    expect(adRepo.save).toHaveBeenCalledTimes(1);
    expect(adRepo.save.mock.calls[0][0].imageMediaId).toBe(savedMedia.id);
    expect(adRepo.save.mock.calls[0][0].imageMediaId).not.toBe(oldMedia.id);

    // Old cleanup happened too.
    expect(storage.remove).toHaveBeenCalledWith(oldMedia.filePath);
    expect(adMediaRepo.delete).toHaveBeenCalledWith(oldMedia.id);

    // Ordering: cleanup strictly after the new saves.
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

  it('throws NOT_FOUND when the library media does not exist', async () => {
    libraryRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ adId: 'ad-1', libraryMediaId: 'missing-lib' }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Library media missing-lib not found',
    });
    expect(adRepo.findById).not.toHaveBeenCalled();
    expect(storage.readFile).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the ad does not exist', async () => {
    libraryRepo.findById.mockResolvedValue(libraryRecord());
    adRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ adId: 'missing', libraryMediaId: 'lib-1' }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Ad missing not found',
    });
    expect(storage.readFile).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('maps an ENOENT file read to NOT_FOUND (library file missing on disk)', async () => {
    libraryRepo.findById.mockResolvedValue(libraryRecord());
    adRepo.findById.mockResolvedValue(
      Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' }),
    );
    const enoent = new Error('no such file');
    (enoent as NodeJS.ErrnoException).code = 'ENOENT';
    storage.readFile.mockRejectedValue(enoent);

    await expect(
      useCase.execute({ adId: 'ad-1', libraryMediaId: 'lib-1' }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'library file missing on disk',
    });
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a non-image library buffer with VALIDATION', async () => {
    libraryRepo.findById.mockResolvedValue(
      libraryRecord({
        filePath: 'crypto-news-ads-library/abc.bin',
        mimeType: 'application/octet-stream',
      }),
    );
    adRepo.findById.mockResolvedValue(
      Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' }),
    );
    storage.readFile.mockResolvedValue(Buffer.from('hello world'));

    await expect(
      useCase.execute({ adId: 'ad-1', libraryMediaId: 'lib-1' }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message: 'only image files are allowed',
    });
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });
});
