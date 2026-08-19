import { ClearAdVideoUseCase } from '../clear-ad-video.use-case';
import { ErrorCode } from 'shared/kernel/domain-error';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import {
  AdMediaRecord,
  AdMediaRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';

describe('ClearAdVideoUseCase', () => {
  let useCase: ClearAdVideoUseCase;
  const adRepo = {
    findById: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<AdRepository>;
  const adMediaRepo = {
    findById: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<AdMediaRepository>;
  const storage = {
    remove: jest.fn(),
  } as unknown as jest.Mocked<AdMediaStoragePort>;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ClearAdVideoUseCase(adRepo, adMediaRepo, storage);
  });

  it('throws NOT_FOUND when the ad does not exist', async () => {
    adRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute('missing')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Ad missing not found',
    });
    expect(adMediaRepo.findById).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(adMediaRepo.delete).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op returning the ad unchanged when it has no video', async () => {
    const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'promo' });
    adRepo.findById.mockResolvedValue(ad);
    const view = await useCase.execute('ad-1');
    expect(view.videoMediaId).toBeNull();
    expect(adMediaRepo.findById).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(adMediaRepo.delete).not.toHaveBeenCalled();
    expect(adRepo.save).not.toHaveBeenCalled();
  });

  it('removes the file, deletes the media row, and saves the ad with videoMediaId null', async () => {
    const media: AdMediaRecord = {
      id: 'media-1',
      adId: 'ad-1',
      filePath: 'crypto-news-ads/ad-1/vid.mp4',
      mimeType: 'video/mp4',
      fileSize: 1024,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const ad = Ad.create({
      id: 'ad-1',
      name: 'Sponsor',
      body: 'promo',
      videoMediaId: media.id,
    });
    adRepo.findById.mockResolvedValue(ad);
    adMediaRepo.findById.mockResolvedValue(media);
    adRepo.save.mockImplementation(async (saved) => saved);

    const view = await useCase.execute('ad-1');

    expect(storage.remove).toHaveBeenCalledWith(media.filePath);
    expect(adMediaRepo.delete).toHaveBeenCalledWith(media.id);
    expect(adRepo.save).toHaveBeenCalledTimes(1);
    expect(adRepo.save.mock.calls[0][0].videoMediaId).toBeNull();
    expect(view.videoMediaId).toBeNull();

    const removeAt = (storage.remove as jest.Mock).mock.invocationCallOrder[0];
    const deleteAt = (adMediaRepo.delete as jest.Mock).mock
      .invocationCallOrder[0];
    const saveAt = (adRepo.save as jest.Mock).mock.invocationCallOrder[0];
    expect(removeAt).toBeLessThan(deleteAt);
    expect(deleteAt).toBeLessThan(saveAt);
  });

  it('clears the ad even when the referenced media row is missing (orphaned)', async () => {
    const ad = Ad.create({
      id: 'ad-1',
      name: 'Sponsor',
      body: 'promo',
      videoMediaId: 'gone-media',
    });
    adRepo.findById.mockResolvedValue(ad);
    adMediaRepo.findById.mockResolvedValue(null);
    adRepo.save.mockImplementation(async (saved) => saved);

    const view = await useCase.execute('ad-1');

    expect(adMediaRepo.findById).toHaveBeenCalledWith('gone-media');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(adMediaRepo.delete).not.toHaveBeenCalled();
    expect(adRepo.save).toHaveBeenCalledTimes(1);
    expect(adRepo.save.mock.calls[0][0].videoMediaId).toBeNull();
    expect(view.videoMediaId).toBeNull();
  });

  it('throws VALIDATION when clearing the video of a video-format ad (invariant: video requires videoMediaId)', async () => {
    const ad = Ad.create({
      id: 'ad-1',
      name: 'Sponsor',
      body: 'promo',
      format: 'video',
      videoMediaId: 'media-1',
    });
    adRepo.findById.mockResolvedValue(ad);
    adMediaRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('ad-1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION,
      message: "ad Sponsor format 'video' requires videoMediaId",
    });
    expect(adRepo.save).not.toHaveBeenCalled();
  });
});
