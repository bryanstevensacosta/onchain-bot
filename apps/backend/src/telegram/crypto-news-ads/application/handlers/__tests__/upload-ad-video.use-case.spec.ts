import { createHash } from 'node:crypto';
import { UploadAdVideoUseCase } from '../upload-ad-video.use-case';
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
 * Real MP4 magic bytes — ISO BMFF `ftyp` box at offset 4 with the `isom`
 * brand (anything not `qt  ` at offset 8 sniffs as `video/mp4`).
 */
const MP4_MAGIC = Buffer.from([
  0x00,
  0x00,
  0x00,
  0x18, // box size
  0x66,
  0x74,
  0x79,
  0x70, // 'ftyp'
  0x69,
  0x73,
  0x6f,
  0x6d, // 'isom' brand → MP4
]);

/** QuickTime MOV magic — `qt  ` brand at offset 8 sniffs as video/quicktime. */
const MOV_MAGIC = Buffer.from([
  0x00,
  0x00,
  0x00,
  0x18, // box size
  0x66,
  0x74,
  0x79,
  0x70, // 'ftyp'
  0x71,
  0x74,
  0x20,
  0x20, // 'qt  ' brand → QuickTime
]);

function mp4Buffer(size = 1024): Buffer {
  return Buffer.concat([
    MP4_MAGIC,
    Buffer.alloc(Math.max(0, size - MP4_MAGIC.length)),
  ]);
}

describe('UploadAdVideoUseCase', () => {
  let useCase: UploadAdVideoUseCase;
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
      relativePath: 'crypto-news-ads-library/uuid.mp4',
      size: 1024,
    });
    useCase = new UploadAdVideoUseCase(
      adRepo,
      adMediaRepo,
      storage,
      libraryRepo,
    );
  });

  it('stores a sniffed MP4, saves the media row + rebuilt ad, returns a view with videoMediaId', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.mp4',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    const buffer = mp4Buffer();
    const view = await useCase.execute({ adId: 'ad-1', buffer });

    expect(storage.store).toHaveBeenCalledWith('ad-1', buffer, 'video/mp4');
    expect(adMediaRepo.save).toHaveBeenCalledTimes(1);
    const savedMedia = adMediaRepo.save.mock.calls[0][0];
    expect(savedMedia.adId).toBe('ad-1');
    expect(savedMedia.filePath).toBe('crypto-news-ads/ad-1/uuid.mp4');
    expect(savedMedia.mimeType).toBe('video/mp4');
    expect(savedMedia.fileSize).toBe(1024);
    expect(savedMedia.id).toEqual(expect.any(String));

    expect(adRepo.save).toHaveBeenCalledTimes(1);
    const savedAd = adRepo.save.mock.calls[0][0];
    expect(savedAd.id).toBe('ad-1');
    expect(savedAd.videoMediaId).toBe(savedMedia.id);
    expect(view.videoMediaId).toBe(savedMedia.id);

    expect(storage.remove).not.toHaveBeenCalled();
    expect(adMediaRepo.delete).not.toHaveBeenCalled();
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

  it('rejects a buffer over 50 MB with VALIDATION and writes nothing', async () => {
    await expect(
      useCase.execute({
        adId: 'ad-1',
        buffer: Buffer.alloc(50 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message: 'file exceeds 50 MB',
    });
    expect(adRepo.findById).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a QuickTime MOV buffer with a clear MP4-only message', async () => {
    const mov = Buffer.concat([
      MOV_MAGIC,
      Buffer.alloc(1024 - MOV_MAGIC.length),
    ]);
    await expect(
      useCase.execute({ adId: 'ad-1', buffer: mov }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message:
        'only MP4 (H.264) video files are allowed — Telegram plays inline only MP4/H.264',
    });
    expect(adRepo.findById).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a non-video buffer with VALIDATION', async () => {
    await expect(
      useCase.execute({ adId: 'ad-1', buffer: Buffer.from('hello world') }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message:
        'only MP4 (H.264) video files are allowed — Telegram plays inline only MP4/H.264',
    });
    expect(adRepo.findById).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the ad does not exist', async () => {
    adRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ adId: 'missing', buffer: mp4Buffer() }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Ad missing not found',
    });
    expect(storage.store).not.toHaveBeenCalled();
    expect(adMediaRepo.save).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('replaces an existing video: old file removed + old row deleted only AFTER the new saves', async () => {
    const oldMedia: AdMediaRecord = {
      id: 'old-media-1',
      adId: 'ad-1',
      filePath: 'crypto-news-ads/ad-1/old-file.mp4',
      mimeType: 'video/mp4',
      fileSize: 512,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const ad = Ad.create({
      id: 'ad-1',
      name: 'Sponsor',
      body: 'promo',
      format: 'video',
      videoMediaId: oldMedia.id,
    });
    adRepo.findById.mockResolvedValue(ad);
    adMediaRepo.findById.mockResolvedValue(oldMedia);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/new-file.mp4',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    await useCase.execute({ adId: 'ad-1', buffer: mp4Buffer() });

    expect(adMediaRepo.save).toHaveBeenCalledTimes(1);
    const savedMedia = adMediaRepo.save.mock.calls[0][0];
    expect(adRepo.save).toHaveBeenCalledTimes(1);
    expect(adRepo.save.mock.calls[0][0].videoMediaId).toBe(savedMedia.id);
    expect(adRepo.save.mock.calls[0][0].videoMediaId).not.toBe(oldMedia.id);

    expect(storage.remove).toHaveBeenCalledWith(oldMedia.filePath);
    expect(adMediaRepo.delete).toHaveBeenCalledWith(oldMedia.id);

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
      relativePath: 'crypto-news-ads/ad-1/uuid.mp4',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    const buffer = mp4Buffer();
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    await useCase.execute({ adId: 'ad-1', buffer });

    expect(storage.storeLibraryFile).toHaveBeenCalledWith(
      buffer,
      'video/mp4',
      contentHash,
    );
    expect(libraryRepo.save).toHaveBeenCalledTimes(1);
    const savedLibraryRecord = libraryRepo.save.mock.calls[0][0];
    expect(savedLibraryRecord.contentHash).toBe(contentHash);
    expect(savedLibraryRecord.filePath).toBe(
      'crypto-news-ads-library/uuid.mp4',
    );
    expect(savedLibraryRecord.mimeType).toBe('video/mp4');
    expect(savedLibraryRecord.fileSize).toBe(1024);
  });

  it('skips the library write entirely when the content hash already exists', async () => {
    const existing: AdMediaLibraryRecord = {
      id: 'lib-1',
      filePath: 'crypto-news-ads-library/abc.mp4',
      contentHash: 'pre-existing-hash',
      originalFileName: 'old.mp4',
      mimeType: 'video/mp4',
      fileSize: 1024,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    libraryRepo.findByContentHash.mockResolvedValueOnce(existing);
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.mp4',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    await useCase.execute({ adId: 'ad-1', buffer: mp4Buffer() });

    expect(storage.storeLibraryFile).not.toHaveBeenCalled();
    expect(libraryRepo.save).not.toHaveBeenCalled();
    expect(adMediaRepo.save).toHaveBeenCalledTimes(1);
    expect(adRepo.save).toHaveBeenCalledTimes(1);
  });

  it('captures originalFileName on the library record when provided, null when omitted', async () => {
    libraryRepo.findByContentHash.mockResolvedValue(null);
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.mp4',
      size: 1024,
    });
    storage.storeLibraryFile.mockResolvedValue({
      relativePath: 'crypto-news-ads-library/uuid.mp4',
      size: 1024,
    });
    adMediaRepo.save.mockImplementation(async (media) => media);

    const buffer = mp4Buffer();

    await useCase.execute({
      adId: 'ad-1',
      buffer,
      originalFileName: 'promo.mp4',
    });
    expect(libraryRepo.save.mock.calls[0][0].originalFileName).toBe(
      'promo.mp4',
    );

    jest.clearAllMocks();
    adRepo.findById.mockResolvedValue(ad);
    storage.store.mockResolvedValue({
      relativePath: 'crypto-news-ads/ad-1/uuid.mp4',
      size: 1024,
    });
    await useCase.execute({ adId: 'ad-1', buffer });
    expect(libraryRepo.save.mock.calls[0][0].originalFileName).toBeNull();
  });
});
