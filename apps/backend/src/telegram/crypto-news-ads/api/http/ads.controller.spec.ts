import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdsController } from './ads.controller';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';

const buildAd = (overrides: {
  id?: string;
  name?: string;
  body?: string;
  imagePath?: string | null;
  order?: number;
}): Ad =>
  Ad.create({
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? `ad-${Math.random().toString(36).slice(2, 6)}`,
    body: overrides.body ?? 'Buy the dip',
    imagePath: overrides.imagePath,
    order: overrides.order,
  });

describe('AdsController', () => {
  let controller: AdsController;
  let adRepo: jest.Mocked<AdRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdsController],
      providers: [
        {
          provide: AdRepository,
          useValue: {
            findAll: jest.fn(),
            findAllActive: jest.fn(),
            findById: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            incrementFailures: jest.fn(),
            disable: jest.fn(),
            markPublished: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AdsController);
    adRepo = module.get(AdRepository);
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
      adRepo.save.mockImplementation(async (ad) => ad);
      const result = await controller.create({
        name: 'Pump alpha',
        body: 'Something good',
        imagePath: '/img/pump.jpg',
      });
      expect(result.name).toBe('Pump alpha');
      expect(result.body).toBe('Something good');
      expect(result.imagePath).toBe('/img/pump.jpg');
      expect(result.enabled).toBe(true);
      expect(result.order).toBe(0);
      expect(adRepo.save).toHaveBeenCalledTimes(1);
    });

    it('defaults imagePath to null when omitted', async () => {
      adRepo.save.mockImplementation(async (ad) => ad);
      const result = await controller.create({ name: 'No image', body: 'x' });
      expect(result.imagePath).toBeNull();
    });

    it('maps a unique-name violation to 409', async () => {
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

    it('clears imagePath with an explicit null', async () => {
      const existing = buildAd({ imagePath: '/img/a.jpg' });
      adRepo.findById.mockResolvedValue(existing);
      adRepo.save.mockImplementation(async (ad) => ad);
      const result = await controller.update(existing.id, { imagePath: null });
      expect(result.imagePath).toBeNull();
    });

    it('maps unique-name violation to 409', async () => {
      const existing = buildAd({ name: 'Original' });
      adRepo.findById.mockResolvedValue(existing);
      adRepo.save.mockRejectedValue({ code: '23505' });
      await expect(
        controller.update(existing.id, { name: 'Duplicate' }),
      ).rejects.toBeInstanceOf(ConflictException);
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

    it('deletes the ad when found', async () => {
      const ad = buildAd({});
      adRepo.findById.mockResolvedValue(ad);
      await controller.remove(ad.id);
      expect(adRepo.delete).toHaveBeenCalledWith(ad.id);
    });
  });
});
