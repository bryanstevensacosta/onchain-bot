import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BlacklistController } from './blacklist.controller';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';
import { PhraseRegistryService } from 'telegram/crypto-news-publisher/application/services/phrase-registry.service';

describe('BlacklistController', () => {
  let controller: BlacklistController;
  let blacklistRepo: jest.Mocked<BlacklistPhraseRepository>;
  let phraseRegistry: jest.Mocked<PhraseRegistryService>;

  const makePhrase = (
    phrase: string,
    andGroupId: string | null = null,
    requireMedia = false,
    enabled = true,
  ): BlacklistPhrase =>
    BlacklistPhrase.create({
      phrase,
      andGroupId,
      requireMedia,
      enabled,
    });

  const mockPhraseRegistry = (): jest.Mocked<PhraseRegistryService> => ({
    throwIfDuplicate: jest.fn().mockResolvedValue(undefined),
    throwIfIntraTableConflict: jest.fn().mockResolvedValue(undefined),
    throwIfCrossTableConflict: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlacklistController],
      providers: [
        {
          provide: BlacklistPhraseRepository,
          useValue: {
            findAll: jest.fn(),
            findEnabled: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: PhraseRegistryService,
          useValue: mockPhraseRegistry(),
        },
      ],
    }).compile();

    controller = module.get<BlacklistController>(BlacklistController);
    blacklistRepo = module.get(BlacklistPhraseRepository);
    phraseRegistry = module.get(PhraseRegistryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('should return all blacklist phrases as views', async () => {
      const phrases = [makePhrase('btc'), makePhrase('eth')];
      blacklistRepo.findAll.mockResolvedValue(phrases);

      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(result[0].phrase).toBe('btc');
      expect(result[1].phrase).toBe('eth');
    });

    it('should return all phrases with new fields', async () => {
      const phrase = makePhrase('btc', 'group-1', true);
      blacklistRepo.findAll.mockResolvedValue([phrase]);

      const result = await controller.list();

      expect(result).toHaveLength(1);
      expect(result[0].andGroupId).toBe('group-1');
      expect(result[0].requireMedia).toBe(true);
    });
  });

  describe('getOne', () => {
    it('should return a single blacklist phrase view by id', async () => {
      const phrase = makePhrase('btc');
      blacklistRepo.findAll.mockResolvedValue([phrase]);

      const result = await controller.getOne(phrase.id);

      expect(result).not.toBeNull();
      expect(result?.phrase).toBe('btc');
    });

    it('should throw NotFound when phrase not found', async () => {
      blacklistRepo.findAll.mockResolvedValue([]);

      await expect(controller.getOne('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a phrase and return defaults for new fields', async () => {
      blacklistRepo.findAll.mockResolvedValue([]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.create({ phrase: 'bitcoin' });

      expect(result.phrase).toBe('bitcoin');
      expect(result.enabled).toBe(true);
      expect(result.andGroupId).toBeNull();
      expect(result.requireMedia).toBe(false);
      expect(blacklistRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should create with andGroupId', async () => {
      blacklistRepo.findAll.mockResolvedValue([]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.create({
        phrase: 'btc',
        andGroupId: 'group-123',
      });

      expect(result.andGroupId).toBe('group-123');
    });

    it('should create with requireMedia true', async () => {
      blacklistRepo.findAll.mockResolvedValue([]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.create({
        phrase: 'btc',
        requireMedia: true,
      });

      expect(result.requireMedia).toBe(true);
    });

    it('should allow same phrase in different groups', async () => {
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.create({
        phrase: 'btc',
        andGroupId: 'group-2',
      });

      expect(result.phrase).toBe('btc');
      expect(result.andGroupId).toBe('group-2');
      expect(phraseRegistry.throwIfDuplicate).toHaveBeenCalledWith(
        'blacklist',
        'btc',
        false,
        'exact',
        'group-2',
      );
    });

    it('should reject duplicate phrase with same group', async () => {
      phraseRegistry.throwIfDuplicate.mockRejectedValue(
        new ConflictException('Blacklist phrase "btc" already exists'),
      );

      await expect(
        controller.create({ phrase: 'btc', andGroupId: 'group-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should reject duplicate phrase with null group', async () => {
      phraseRegistry.throwIfDuplicate.mockRejectedValue(
        new ConflictException('Blacklist phrase "btc" already exists'),
      );

      await expect(
        controller.create({ phrase: 'btc', andGroupId: null }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('should update the phrase', async () => {
      const existing = makePhrase('btc');
      blacklistRepo.findAll.mockResolvedValue([existing]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        phrase: 'bitcoin',
      });

      expect(result.phrase).toBe('bitcoin');
      expect(result.id).toBe(existing.id);
    });

    it('should update andGroupId', async () => {
      const existing = makePhrase('btc', null);
      blacklistRepo.findAll.mockResolvedValue([existing]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        andGroupId: 'new-group',
      });

      expect(result.andGroupId).toBe('new-group');
    });

    it('should preserve andGroupId when not provided', async () => {
      const existing = makePhrase('btc', 'group-1');
      blacklistRepo.findAll.mockResolvedValue([existing]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        phrase: 'bitcoin',
      });

      expect(result.andGroupId).toBe('group-1');
    });

    it('should update requireMedia', async () => {
      const existing = makePhrase('btc', null, false);
      blacklistRepo.findAll.mockResolvedValue([existing]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        requireMedia: true,
      });

      expect(result.requireMedia).toBe(true);
    });

    it('should preserve requireMedia when not provided', async () => {
      const existing = makePhrase('btc', null, true);
      blacklistRepo.findAll.mockResolvedValue([existing]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        phrase: 'bitcoin',
      });

      expect(result.requireMedia).toBe(true);
    });

    it('should enable a disabled phrase', async () => {
      const existing = BlacklistPhrase.create({
        phrase: 'btc',
        enabled: false,
      });
      blacklistRepo.findAll.mockResolvedValue([existing]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, { enabled: true });

      expect(result.enabled).toBe(true);
    });

    it('should disable an enabled phrase', async () => {
      const existing = makePhrase('btc', null, false, true);
      blacklistRepo.findAll.mockResolvedValue([existing]);
      blacklistRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, { enabled: false });

      expect(result.enabled).toBe(false);
    });

    it('should throw NotFound when phrase not found', async () => {
      blacklistRepo.findAll.mockResolvedValue([]);

      await expect(
        controller.update('nonexistent', { phrase: 'test' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete the phrase', async () => {
      blacklistRepo.delete.mockResolvedValue();

      await controller.remove('phrase-1');

      expect(blacklistRepo.delete).toHaveBeenCalledWith('phrase-1');
    });
  });
});
