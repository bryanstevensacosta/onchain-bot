import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { KeywordsController } from './keywords.controller';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

describe('KeywordsController', () => {
  let controller: KeywordsController;
  let keywordRepo: jest.Mocked<KeywordRepository>;

  const makeKeyword = (phrase: string, enabled = true): Keyword =>
    Keyword.create({ phrase, enabled });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KeywordsController],
      providers: [
        {
          provide: KeywordRepository,
          useValue: {
            findAll: jest.fn(),
            findEnabled: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<KeywordsController>(KeywordsController);
    keywordRepo = module.get(KeywordRepository);
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
      keywordRepo.save.mockResolvedValue();

      const result = await controller.create({ phrase: 'bitcoin' });

      expect(result.phrase).toBe('bitcoin');
      expect(result.enabled).toBe(true);
      expect(result.templateId).toBeNull();
      expect(keywordRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should honour caseSensitive flag', async () => {
      keywordRepo.save.mockResolvedValue();

      const result = await controller.create({
        phrase: 'BTC',
        caseSensitive: true,
      });

      expect(result.caseSensitive).toBe(true);
    });

    it('binds a templateId on create when provided', async () => {
      keywordRepo.save.mockResolvedValue();
      const templateId = crypto.randomUUID();

      const result = await controller.create({
        phrase: 'btc',
        templateId,
      });

      expect(result.templateId).toBe(templateId);
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
