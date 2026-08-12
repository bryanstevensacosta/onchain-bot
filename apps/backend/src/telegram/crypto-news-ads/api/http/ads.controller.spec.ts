import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AdsController, AdsMediaController } from './ads.controller';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import {
  AdMediaRecord,
  AdMediaRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import {
  AdMediaLibraryRecord,
  AdMediaLibraryRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { UploadAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/upload-ad-image.use-case';
import { ClearAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/clear-ad-image.use-case';
import { ReuseLibraryImageUseCase } from 'telegram/crypto-news-ads/application/handlers/reuse-library-image.use-case';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { toAdView } from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

const buildAd = (overrides: {
  id?: string;
  name?: string;
  body?: string;
  imageMediaId?: string | null;
  order?: number;
  enabled?: boolean;
  expiresAt?: Date | null;
  expirationAction?: 'disable' | 'delete';
}): Ad => {
  const created = Ad.create({
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? `ad-${Math.random().toString(36).slice(2, 6)}`,
    body: overrides.body ?? 'Buy the dip',
    imageMediaId: overrides.imageMediaId,
    order: overrides.order,
    expiresAt: overrides.expiresAt,
    expirationAction: overrides.expirationAction,
  });
  return overrides.enabled === false ? created.disable() : created;
};

const buildMediaRow = (
  overrides: Partial<AdMediaRecord> = {},
): AdMediaRecord => ({
  id: 'media-1',
  adId: 'ad-1',
  filePath: 'crypto-news-ads/ad-1/img.png',
  mimeType: 'image/png',
  fileSize: 8,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const buildLibraryRecord = (
  overrides: Partial<AdMediaLibraryRecord> = {},
): AdMediaLibraryRecord => ({
  id: '11111111-2222-3333-4444-555555555555',
  filePath: 'crypto-news-ads-library/b6f32bc41e2a01d0.png',
  contentHash: 'b6f32bc41e2a01d0',
  originalFileName: 'hero.png',
  mimeType: 'image/png',
  fileSize: 8,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const createRes = (): Response =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn(),
  }) as unknown as Response;

describe('AdsController', () => {
  let controller: AdsController;
  let mediaController: AdsMediaController;
  let adRepo: jest.Mocked<AdRepository>;
  let adMediaRepo: jest.Mocked<AdMediaRepository>;
  let libraryRepo: jest.Mocked<AdMediaLibraryRepository>;
  let storage: jest.Mocked<AdMediaStoragePort>;
  let uploadImageUseCase: jest.Mocked<UploadAdImageUseCase>;
  let clearImageUseCase: jest.Mocked<ClearAdImageUseCase>;
  let reuseImageUseCase: jest.Mocked<ReuseLibraryImageUseCase>;
  let uploadsRoot: string;

  const PAST = new Date('2020-01-01T00:00:00.000Z');
  const FUTURE = new Date('2099-01-01T00:00:00.000Z');
  const MEDIA_UUID = '11111111-2222-3333-4444-555555555555';
  const AD_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(async () => {
    uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ads-media-'));
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdsController, AdsMediaController],
      providers: [
        {
          provide: AdRepository,
          useValue: {
            findAll: jest.fn(),
            findAllActive: jest.fn(),
            findExpired: jest.fn(),
            findById: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            incrementFailures: jest.fn(),
            disable: jest.fn(),
            markPublished: jest.fn(),
          },
        },
        {
          provide: AdMediaRepository,
          useValue: {
            save: jest.fn(),
            findById: jest.fn(),
            findByAdId: jest.fn(),
            delete: jest.fn(),
            deleteByAdId: jest.fn(),
          },
        },
        {
          provide: AdMediaLibraryRepository,
          useValue: {
            save: jest.fn(),
            findById: jest.fn(),
            findByContentHash: jest.fn(),
            findAll: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: AdMediaStoragePort,
          useValue: { store: jest.fn(), remove: jest.fn() },
        },
        {
          provide: UploadAdImageUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ClearAdImageUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ReuseLibraryImageUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => ({ uploadsRoot })) },
        },
      ],
    }).compile();

    controller = module.get(AdsController);
    mediaController = module.get(AdsMediaController);
    adRepo = module.get(AdRepository);
    adMediaRepo = module.get(AdMediaRepository);
    libraryRepo = module.get(AdMediaLibraryRepository);
    storage = module.get(AdMediaStoragePort);
    uploadImageUseCase = module.get(UploadAdImageUseCase);
    clearImageUseCase = module.get(ClearAdImageUseCase);
    reuseImageUseCase = module.get(ReuseLibraryImageUseCase);
  });

  afterEach(async () => {
    await fs.rm(uploadsRoot, { recursive: true, force: true });
  });

  describe('list', () => {
    it('returns views for every ad', async () => {
      adRepo.findAll.mockResolvedValue([
        buildAd({ name: 'Alpha' }),
        buildAd({ name: 'Bravo' }),
      ]);
      const result = await controller.list();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alpha');
      expect(result[1].name).toBe('Bravo');
    });

    it('returns an empty list when no ads exist', async () => {
      adRepo.findAll.mockResolvedValue([]);
      const result = await controller.list();
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('builds + persists a new ad and returns the view', async () => {
      adRepo.findAll.mockResolvedValue([]);
      adRepo.save.mockImplementation(async (ad) => ad);
      const result = await controller.create({
        name: 'Pump alpha',
        body: 'Something good',
      });
      expect(result.name).toBe('Pump alpha');
      expect(result.body).toBe('Something good');
      // Create does not accept image fields (plan D2 — images go through
      // the dedicated upload command), so the fresh ad has no media.
      expect(result.imageMediaId).toBeNull();
      expect(result.enabled).toBe(true);
      expect(result.order).toBe(0);
      expect(adRepo.save).toHaveBeenCalledTimes(1);
    });

    it('assigns the next order after the current max (append semantics)', async () => {
      adRepo.findAll.mockResolvedValue([
        buildAd({ name: 'First', order: 0 }),
        buildAd({ name: 'Second', order: 3 }),
      ]);
      adRepo.save.mockImplementation(async (ad) => ad);
      const result = await controller.create({ name: 'New', body: 'x' });
      expect(result.order).toBe(4);
    });

    it('defaults imageMediaId to null when omitted', async () => {
      adRepo.findAll.mockResolvedValue([]);
      adRepo.save.mockImplementation(async (ad) => ad);
      const result = await controller.create({ name: 'No image', body: 'x' });
      expect(result.imageMediaId).toBeNull();
    });

    it('maps a unique-name violation to 409', async () => {
      adRepo.findAll.mockResolvedValue([]);
      adRepo.save.mockRejectedValue({ code: '23505' });
      await expect(
        controller.create({ name: 'Alpha', body: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('returns 404 when the ad is missing', async () => {
      adRepo.findById.mockResolvedValue(null);
      await expect(
        controller.update('nope', { name: 'Whatever' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 for a non-UUID id without hitting the repo', async () => {
      await expect(
        controller.update('../../etc/passwd', { name: 'Whatever' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(adRepo.findById).not.toHaveBeenCalled();
    });

    it('applies the patch and persists', async () => {
      const existing = buildAd({ name: 'Old' });
      adRepo.findById.mockResolvedValue(existing);
      adRepo.save.mockImplementation(async (ad) => ad);
      const result = await controller.update(existing.id, {
        name: 'Renamed',
        order: 3,
      });
      expect(result.name).toBe('Renamed');
      expect(result.order).toBe(3);
      expect(adRepo.save).toHaveBeenCalledTimes(1);
    });

    it('flips enabled via disable/enable patch', async () => {
      const existing = buildAd({});
      adRepo.findById.mockResolvedValue(existing);
      adRepo.save.mockImplementation(async (ad) => ad);
      const disabled = await controller.update(existing.id, { enabled: false });
      expect(disabled.enabled).toBe(false);
      const reEnabled = await controller.update(existing.id, { enabled: true });
      expect(reEnabled.enabled).toBe(true);
    });

    it('maps unique-name violation to 409', async () => {
      const existing = buildAd({ name: 'Original' });
      adRepo.findById.mockResolvedValue(existing);
      adRepo.save.mockRejectedValue({ code: '23505' });
      await expect(
        controller.update(existing.id, { name: 'Duplicate' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    describe('expiry truth table (Metis F5.1 + MA1)', () => {
      it('409s when enabling an expired ad', async () => {
        const existing = buildAd({ enabled: false, expiresAt: PAST });
        adRepo.findById.mockResolvedValue(existing);
        await expect(
          controller.update(existing.id, { enabled: true }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(adRepo.save).not.toHaveBeenCalled();
      });

      it('200s when enabling with a future expiresAt (renewal)', async () => {
        const existing = buildAd({ enabled: false, expiresAt: PAST });
        adRepo.findById.mockResolvedValue(existing);
        adRepo.save.mockImplementation(async (ad) => ad);
        const result = await controller.update(existing.id, {
          enabled: true,
          expiresAt: FUTURE.toISOString(),
        });
        expect(result.enabled).toBe(true);
        expect(result.expiresAt).toBe(FUTURE.toISOString());
      });

      it('200s when enabling with expiresAt null (clear)', async () => {
        const existing = buildAd({ enabled: false, expiresAt: PAST });
        adRepo.findById.mockResolvedValue(existing);
        adRepo.save.mockImplementation(async (ad) => ad);
        const result = await controller.update(existing.id, {
          enabled: true,
          expiresAt: null,
        });
        expect(result.enabled).toBe(true);
        expect(result.expiresAt).toBeNull();
      });

      it('200s when disabling an expired ad (enabled:false)', async () => {
        const existing = buildAd({ enabled: true, expiresAt: PAST });
        adRepo.findById.mockResolvedValue(existing);
        adRepo.save.mockImplementation(async (ad) => ad);
        const result = await controller.update(existing.id, {
          enabled: false,
        });
        expect(result.enabled).toBe(false);
      });

      it('does not 409 on an empty patch for an enabled non-expired ad', async () => {
        const existing = buildAd({ enabled: true, expiresAt: FUTURE });
        adRepo.findById.mockResolvedValue(existing);
        adRepo.save.mockImplementation(async (ad) => ad);
        const result = await controller.update(existing.id, {});
        expect(result.enabled).toBe(true);
      });

      it('409s when changing ONLY expirationAction on an expired enabled ad (MA1)', async () => {
        const existing = buildAd({
          enabled: true,
          expiresAt: PAST,
          expirationAction: 'disable',
        });
        adRepo.findById.mockResolvedValue(existing);
        await expect(
          controller.update(existing.id, { expirationAction: 'delete' }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(adRepo.save).not.toHaveBeenCalled();
      });

      it('clears expiresAt with an explicit null', async () => {
        const existing = buildAd({ enabled: true, expiresAt: PAST });
        adRepo.findById.mockResolvedValue(existing);
        adRepo.save.mockImplementation(async (ad) => ad);
        const result = await controller.update(existing.id, {
          expiresAt: null,
        });
        expect(result.expiresAt).toBeNull();
        expect(result.enabled).toBe(true);
      });

      it('allows setting a past expiresAt on a non-expired ad (write-time allowed; sweep enforces later)', async () => {
        const existing = buildAd({ enabled: true, expiresAt: FUTURE });
        adRepo.findById.mockResolvedValue(existing);
        adRepo.save.mockImplementation(async (ad) => ad);
        const result = await controller.update(existing.id, {
          expiresAt: PAST.toISOString(),
        });
        expect(result.expiresAt).toBe(PAST.toISOString());
      });
    });
  });

  describe('uploadImage', () => {
    it('delegates the uploaded file to UploadAdImageUseCase and returns the view', async () => {
      const ad = buildAd({ id: AD_UUID, imageMediaId: MEDIA_UUID });
      uploadImageUseCase.execute.mockResolvedValue(toAdView(ad));
      const file = {
        buffer: Buffer.from('png-bytes'),
        originalname: 'hero.png',
      } as Express.Multer.File;
      const result = await controller.uploadImage(AD_UUID, file);
      expect(uploadImageUseCase.execute).toHaveBeenCalledWith({
        adId: AD_UUID,
        buffer: file.buffer,
        originalFileName: 'hero.png',
      });
      expect(result.imageMediaId).toBe(MEDIA_UUID);
    });

    it('returns 404 for a non-UUID id without invoking the use case', async () => {
      const file = {
        buffer: Buffer.from('png-bytes'),
        originalname: 'hero.png',
      } as Express.Multer.File;
      await expect(
        controller.uploadImage('not-a-uuid', file),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(uploadImageUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('clearImage', () => {
    it('delegates to ClearAdImageUseCase and returns the view', async () => {
      const ad = buildAd({ id: AD_UUID });
      clearImageUseCase.execute.mockResolvedValue(toAdView(ad));
      const result = await controller.clearImage(AD_UUID);
      expect(clearImageUseCase.execute).toHaveBeenCalledWith(AD_UUID);
      expect(result.id).toBe(AD_UUID);
    });

    it('returns 404 for a non-UUID id without invoking the use case', async () => {
      await expect(controller.clearImage('not-a-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(clearImageUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('reuseImage', () => {
    it('delegates libraryMediaId to ReuseLibraryImageUseCase and returns the view', async () => {
      const ad = buildAd({ id: AD_UUID, imageMediaId: MEDIA_UUID });
      reuseImageUseCase.execute.mockResolvedValue(toAdView(ad));
      const result = await controller.reuseImage(AD_UUID, {
        libraryMediaId: MEDIA_UUID,
      });
      expect(reuseImageUseCase.execute).toHaveBeenCalledWith({
        adId: AD_UUID,
        libraryMediaId: MEDIA_UUID,
      });
      expect(result.imageMediaId).toBe(MEDIA_UUID);
    });

    it('returns 404 for a non-UUID ad id without invoking the use case', async () => {
      await expect(
        controller.reuseImage('not-a-uuid', { libraryMediaId: MEDIA_UUID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reuseImageUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('returns 404 when missing', async () => {
      adRepo.findById.mockResolvedValue(null);
      await expect(controller.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(adRepo.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for a non-UUID id without hitting the repo', async () => {
      await expect(controller.remove('not-a-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(adRepo.findById).not.toHaveBeenCalled();
      expect(adRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes the ad when found', async () => {
      const ad = buildAd({});
      adRepo.findById.mockResolvedValue(ad);
      await controller.remove(ad.id);
      expect(adRepo.delete).toHaveBeenCalledWith(ad.id);
    });

    it('purges the media file + row before deleting an ad that has an image', async () => {
      const media = buildMediaRow({ id: 'media-1', adId: AD_UUID });
      const ad = buildAd({ id: AD_UUID, imageMediaId: media.id });
      adRepo.findById.mockResolvedValue(ad);
      adMediaRepo.findById.mockResolvedValue(media);
      await controller.remove(AD_UUID);
      expect(storage.remove).toHaveBeenCalledWith(media.filePath);
      expect(adMediaRepo.delete).toHaveBeenCalledWith(media.id);
      expect(adRepo.delete).toHaveBeenCalledWith(AD_UUID);
    });

    it('skips media cleanup for an ad without an image', async () => {
      const ad = buildAd({ id: AD_UUID });
      adRepo.findById.mockResolvedValue(ad);
      await controller.remove(AD_UUID);
      expect(adMediaRepo.findById).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
      expect(adRepo.delete).toHaveBeenCalledWith(AD_UUID);
    });
  });

  describe('AdsMediaController.getMedia', () => {
    it('serves 200 with the correct Content-Type for a known media id', async () => {
      const media = buildMediaRow({ id: MEDIA_UUID });
      adMediaRepo.findById.mockResolvedValue(media);
      await fs.mkdir(path.join(uploadsRoot, 'crypto-news-ads', 'ad-1'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(uploadsRoot, media.filePath),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );

      const res = createRes();
      await mediaController.getMedia(
        MEDIA_UUID,
        { headers: {} } as Request,
        res,
      );

      expect(adMediaRepo.findById).toHaveBeenCalledWith(MEDIA_UUID);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 for a non-UUID media id without hitting the repo', async () => {
      const res = createRes();
      await mediaController.getMedia(
        '../../etc/passwd',
        { headers: {} } as Request,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(adMediaRepo.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when no media row exists for the id', async () => {
      adMediaRepo.findById.mockResolvedValue(null);
      const res = createRes();
      await mediaController.getMedia(
        MEDIA_UUID,
        { headers: {} } as Request,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 404 when the on-disk file is missing', async () => {
      const media = buildMediaRow({ id: MEDIA_UUID });
      adMediaRepo.findById.mockResolvedValue(media);
      const res = createRes();
      await mediaController.getMedia(
        MEDIA_UUID,
        { headers: {} } as Request,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('AdsMediaController media-library', () => {
    it('lists every library row mapped to {id,url,originalFileName,mimeType,fileSize,createdAt}', async () => {
      libraryRepo.findAll.mockResolvedValue([
        buildLibraryRecord({}),
        buildLibraryRecord({
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0000',
          filePath: 'crypto-news-ads-library/abc.png',
          originalFileName: 'banner.png',
        }),
      ]);
      const list = await mediaController.listMediaLibrary();
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        id: buildLibraryRecord({}).id,
        url: `/crypto-news-ads/media-library/${buildLibraryRecord({}).id}`,
        originalFileName: 'hero.png',
        mimeType: 'image/png',
        fileSize: 8,
        createdAt: buildLibraryRecord({}).createdAt,
      });
    });

    it('returns an empty array when the library is empty', async () => {
      libraryRepo.findAll.mockResolvedValue([]);
      const list = await mediaController.listMediaLibrary();
      expect(list).toEqual([]);
    });

    it('serves 200 with the correct Content-Type for a known library id', async () => {
      const record = buildLibraryRecord({});
      libraryRepo.findById.mockResolvedValue(record);
      await fs.mkdir(path.join(uploadsRoot, 'crypto-news-ads-library'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(uploadsRoot, record.filePath),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );

      const res = createRes();
      await mediaController.getLibraryMedia(
        MEDIA_UUID,
        { headers: {} } as Request,
        res,
      );

      expect(libraryRepo.findById).toHaveBeenCalledWith(MEDIA_UUID);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 for a non-UUID library id without hitting the repo', async () => {
      const res = createRes();
      await mediaController.getLibraryMedia(
        '../../etc/passwd',
        { headers: {} } as Request,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(libraryRepo.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when no library row exists for the id', async () => {
      libraryRepo.findById.mockResolvedValue(null);
      const res = createRes();
      await mediaController.getLibraryMedia(
        MEDIA_UUID,
        { headers: {} } as Request,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 404 when the on-disk library file is missing', async () => {
      const record = buildLibraryRecord({});
      libraryRepo.findById.mockResolvedValue(record);
      const res = createRes();
      await mediaController.getLibraryMedia(
        MEDIA_UUID,
        { headers: {} } as Request,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
