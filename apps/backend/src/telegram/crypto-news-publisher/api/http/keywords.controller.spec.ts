import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { KeywordsController } from './keywords.controller';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { PhraseRegistryService } from 'telegram/crypto-news-publisher/application/services/phrase-registry.service';

describe('KeywordsController', () => {
  let controller: KeywordsController;
  let keywordRepo: jest.Mocked<KeywordRepository>;
  let phraseRegistry: jest.Mocked<PhraseRegistryService>;

  const makeKeyword = (
    phrase: string,
    enabled = true,
    andGroupId: string | null = null,
  ): Keyword => Keyword.create({ phrase, enabled, andGroupId });

  const mockPhraseRegistry = (): jest.Mocked<PhraseRegistryService> => ({
    throwIfDuplicate: jest.fn().mockResolvedValue(undefined),
    throwIfIntraTableConflict: jest.fn().mockResolvedValue(undefined),
    throwIfCrossTableConflict: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KeywordsController],
      providers: [
        {
          provide: KeywordRepository,
          useValue: {
            findAll: jest.fn(),
            findEnabled: jest.fn(),
            findById: jest.fn(),
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

    controller = module.get<KeywordsController>(KeywordsController);
    keywordRepo = module.get(KeywordRepository);
    phraseRegistry = module.get(PhraseRegistryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('should return all keywords as views', async () => {
      const keywords = [makeKeyword('btc'), makeKeyword('eth')];
      keywordRepo.findAll.mockResolvedValue(keywords);

      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(result[0].phrase).toBe('btc');
      expect(result[1].phrase).toBe('eth');
    });
  });

  describe('getOne', () => {
    it('should return a single keyword view by id', async () => {
      const kw = makeKeyword('btc');
      keywordRepo.findAll.mockResolvedValue([kw]);

      const result = await controller.getOne(kw.id);

      expect(result).not.toBeNull();
      expect(result?.phrase).toBe('btc');
    });

    it('should throw NotFound when keyword not found', async () => {
      keywordRepo.findAll.mockResolvedValue([]);

      await expect(controller.getOne('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a keyword and save it', async () => {
      keywordRepo.findAll.mockResolvedValue([]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.create({ phrase: 'bitcoin' });

      expect(result.phrase).toBe('bitcoin');
      expect(result.enabled).toBe(true);
      expect(result.templateId).toBeNull();
      expect(result.requireMedia).toBe(false);
      expect(keywordRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should honour caseSensitive flag', async () => {
      keywordRepo.findAll.mockResolvedValue([]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.create({
        phrase: 'BTC',
        caseSensitive: true,
      });

      expect(result.caseSensitive).toBe(true);
    });

    it('binds a templateId on create when provided', async () => {
      keywordRepo.findAll.mockResolvedValue([]);
      keywordRepo.save.mockResolvedValue();
      const templateId = crypto.randomUUID();

      const result = await controller.create({
        phrase: 'btc',
        templateId,
      });

      expect(result.templateId).toBe(templateId);
    });

    it('passes requireMedia=true through to the created keyword', async () => {
      keywordRepo.findAll.mockResolvedValue([]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.create({
        phrase: 'btc',
        requireMedia: true,
      });

      expect(result.requireMedia).toBe(true);
    });

    it('passes andGroupId through to the created keyword', async () => {
      keywordRepo.findAll.mockResolvedValue([]);
      keywordRepo.save.mockResolvedValue();
      const andGroupId = crypto.randomUUID();

      const result = await controller.create({
        phrase: 'btc',
        andGroupId,
      });

      expect(result.andGroupId).toBe(andGroupId);
    });

    it('allows same phrase in different groups', async () => {
      const andGroupId = crypto.randomUUID();
      keywordRepo.save.mockResolvedValue();

      const result = await controller.create({
        phrase: 'btc',
        andGroupId: null,
      });

      expect(result.andGroupId).toBeNull();
      expect(phraseRegistry.throwIfDuplicate).toHaveBeenCalledWith(
        'keyword',
        'btc',
        false,
        'exact',
        null,
      );
    });

    it('rejects same phrase with same group', async () => {
      const andGroupId = crypto.randomUUID();
      phraseRegistry.throwIfDuplicate.mockRejectedValue(
        new ConflictException('Keyword "btc" already exists'),
      );

      await expect(
        controller.create({
          phrase: 'btc',
          andGroupId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('should update the phrase', async () => {
      const existing = makeKeyword('btc');
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        phrase: 'bitcoin',
      });

      expect(result.phrase).toBe('bitcoin');
      expect(result.id).toBe(existing.id);
    });

    it('should enable a disabled keyword', async () => {
      const existing = Keyword.create({ phrase: 'btc', enabled: false });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, { enabled: true });

      expect(result.enabled).toBe(true);
    });

    it('should disable an enabled keyword', async () => {
      const existing = makeKeyword('btc', true);
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, { enabled: false });

      expect(result.enabled).toBe(false);
    });

    it('should bind a templateId via update', async () => {
      const existing = makeKeyword('btc');
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();
      const templateId = crypto.randomUUID();

      const result = await controller.update(existing.id, { templateId });

      expect(result.templateId).toBe(templateId);
    });

    it('should clear an existing templateId via update with null', async () => {
      const existing = Keyword.create({
        phrase: 'btc',
        templateId: crypto.randomUUID(),
      });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, { templateId: null });

      expect(result.templateId).toBeNull();
    });

    it('should preserve an existing templateId when update omits it', async () => {
      const templateId = crypto.randomUUID();
      const existing = Keyword.create({ phrase: 'btc', templateId });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        enabled: true,
      });

      expect(result.templateId).toBe(templateId);
    });

    it('should toggle requireMedia via update', async () => {
      const existing = Keyword.create({ phrase: 'btc', requireMedia: false });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        requireMedia: true,
      });

      expect(result.requireMedia).toBe(true);
    });

    it('should preserve an existing requireMedia when update omits it', async () => {
      const existing = Keyword.create({ phrase: 'btc', requireMedia: true });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        enabled: true,
      });

      expect(result.requireMedia).toBe(true);
    });

    it('should set andGroupId via update', async () => {
      const existing = Keyword.create({ phrase: 'btc', andGroupId: null });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();
      const andGroupId = crypto.randomUUID();

      const result = await controller.update(existing.id, { andGroupId });

      expect(result.andGroupId).toBe(andGroupId);
    });

    it('should clear andGroupId via update with null', async () => {
      const andGroupId = crypto.randomUUID();
      const existing = Keyword.create({ phrase: 'btc', andGroupId });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, { andGroupId: null });

      expect(result.andGroupId).toBeNull();
    });

    it('should preserve an existing andGroupId when update omits it', async () => {
      const andGroupId = crypto.randomUUID();
      const existing = Keyword.create({ phrase: 'btc', andGroupId });
      keywordRepo.findAll.mockResolvedValue([existing]);
      keywordRepo.save.mockResolvedValue();

      const result = await controller.update(existing.id, {
        enabled: true,
      });

      expect(result.andGroupId).toBe(andGroupId);
    });

    it('should throw NotFound when keyword not found', async () => {
      keywordRepo.findAll.mockResolvedValue([]);

      await expect(
        controller.update('nonexistent', { enabled: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete the keyword', async () => {
      keywordRepo.delete.mockResolvedValue();

      await controller.remove('kw-1');

      expect(keywordRepo.delete).toHaveBeenCalledWith('kw-1');
    });
  });
});
