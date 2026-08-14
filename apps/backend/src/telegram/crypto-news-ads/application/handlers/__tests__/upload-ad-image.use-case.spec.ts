import { createHash } from 'node:crypto';
import { UploadAdImageUseCase } from '../upload-ad-image.use-case';
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

describe('UploadAdImageUseCase', () => {
  let useCase: UploadAdImageUseCase;
  const adRepo = {
    findById: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<AdRepository>;
  const adMediaRepo = {
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<AdMediaRepository>;
  const storage = {
    store: jest.fn(),
    remove: jest.fn(),
    storeLibraryFile: jest.fn(),
  } as unknown as jest.Mocked<AdMediaStoragePort>;
  const libraryRepo = {
    findByContentHash: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<AdMediaLibraryRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.storeLibraryFile.mockResolvedValue({
      relativePath: 'crypto-news-ads-library/uuid.png',
      size: 1024,
    });
    useCase = new UploadAdImageUseCase(
      adRepo,
      adMediaRepo,
      storage,
      libraryRepo,
    );
  });

  it('stores a sniffed PNG, saves the media row + rebuilt ad, returns a view with imageMediaId', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    const buffer = pngBuffer();
    const view = await useCase.execute({ adId: 'ad-1', buffer });

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

  it('preserves the ad format (photo) and the video/album media fields when rebuilding the ad after upload', async () => {
    const ad = Ad.create({
      id: 'ad-1',
      name: 'Sponsor',
      body: 'promo',
      format: 'photo',
      imageMediaId: 'img-1',
    });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    await useCase.execute({ adId: 'ad-1', buffer: pngBuffer() });

    expect(adRepo.save).toHaveBeenCalledTimes(1);
    const savedAd = adRepo.save.mock.calls[0][0];
    expect(savedAd.format).toBe('photo');
    expect(savedAd.videoMediaId).toBeNull();
    expect(savedAd.albumMediaIds).toBeNull();
  });

  it('rejects an empty buffer with VALIDATION and writes nothing', async () => {
    await expect(
      useCase.execute({ adId: 'ad-1', buffer: Buffer.alloc(0) }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message: 'empty file',
    });
    expect(adRepo.findById).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a buffer over 10 MB with VALIDATION and writes nothing', async () => {
    await expect(
      useCase.execute({ adId: 'ad-1', buffer: Buffer.alloc(11 * 1024 * 1024) }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message: 'file exceeds 10 MB',
    });
    expect(adRepo.findById).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a non-image buffer with VALIDATION', async () => {
    await expect(
      useCase.execute({ adId: 'ad-1', buffer: Buffer.from('hello world') }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message: 'only image files are allowed',
    });
    expect(adRepo.findById).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the ad does not exist', async () => {
    adRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ adId: 'missing', buffer: pngBuffer() }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Ad missing not found',
    });
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
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
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/new-file.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    await useCase.execute({ adId: 'ad-1', buffer: pngBuffer() });

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

  it('registers a new library entry for a fresh content hash (storeLibraryFile + save with matching sha256)', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    const buffer = pngBuffer();
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    await useCase.execute({ adId: 'ad-1', buffer });

    expect(storage.storeLibraryFile).toHaveBeenCalledWith(
      buffer,
      'image/png',
      contentHash,
    );
    expect(libraryRepo.save).toHaveBeenCalledTimes(1);
    const savedLibraryRecord = libraryRepo.save.mock.calls[0][0];
    expect(savedLibraryRecord.contentHash).toBe(contentHash);
    expect(savedLibraryRecord.filePath).toBe(
      'crypto-news-ads-library/uuid.png',
    );
    expect(savedLibraryRecord.mimeType).toBe('image/png');
    expect(savedLibraryRecord.fileSize).toBe(1024);
  });

  it('skips the library write entirely when the content hash already exists', async () => {
    const existing: AdMediaLibraryRecord = {
      id: 'lib-1',
      filePath: 'crypto-news-ads-library/abc.png',
      contentHash: 'pre-existing-hash',
      originalFileName: 'old.png',
      mimeType: 'image/png',
      fileSize: 1024,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    libraryRepo.findByContentHash.mockResolvedValueOnce(existing);
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    await useCase.execute({ adId: 'ad-1', buffer: pngBuffer() });

    expect(storage.storeLibraryFile).not.toHaveBeenCalled();
    expect(libraryRepo.save).not.toHaveBeenCalled();
    // The ad upload itself still proceeds untouched.
    expect(adMediaRepo.save).toHaveBeenCalledTimes(1);
    expect(adRepo.save).toHaveBeenCalledTimes(1);
  });

  it('captures originalFileName on the library record when provided, null when omitted', async () => {
    libraryRepo.findByContentHash.mockResolvedValue(null);
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.png',
      size: 1024,
    });
    storage.storeLibraryFile.mockResolvedValue({
      relativePath: 'crypto-news-ads-library/uuid.png',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    const buffer = pngBuffer();

    await useCase.execute({
      adId: 'ad-1',
      buffer,
      originalFileName: 'banner.png',
    });
    expect(libraryRepo.save.mock.calls[0][0].originalFileName).toBe(
      'banner.png',
    );

    jest.clearAllMocks();
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.png',
      size: 1024,
    });
    await useCase.execute({ adId: 'ad-1', buffer });
    expect(libraryRepo.save.mock.calls[0][0].originalFileName).toBeNull();
  });
});
