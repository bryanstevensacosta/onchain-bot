import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PhraseRegistryService } from './phrase-registry.service';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';

describe('PhraseRegistryService', () => {
  let service: PhraseRegistryService;
  let keywordRepo: jest.Mocked<KeywordRepository>;
  let blacklistRepo: jest.Mocked<BlacklistPhraseRepository>;

  const makeKeyword = (
    phrase: string,
    caseSensitive = false,
    matchMode: 'exact' | 'substring' = 'exact',
    andGroupId: string | null = null,
  ): Keyword =>
    Keyword.create({
      phrase,
      caseSensitive,
      matchMode,
      andGroupId,
    });

  const makeBlacklist = (
    phrase: string,
    caseSensitive = false,
    matchMode: 'exact' | 'substring' = 'exact',
    andGroupId: string | null = null,
  ): BlacklistPhrase =>
    BlacklistPhrase.create({
      phrase,
      caseSensitive,
      matchMode,
      andGroupId,
    });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhraseRegistryService,
        {
          provide: KeywordRepository,
          useValue: {
            findAll: jest.fn(),
            findEnabled: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: BlacklistPhraseRepository,
          useValue: {
            findAll: jest.fn(),
            findEnabled: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PhraseRegistryService>(PhraseRegistryService);
    keywordRepo = module.get(KeywordRepository);
    blacklistRepo = module.get(BlacklistPhraseRepository);
  });

  // ── Intra-table: keywords ──────────────────────────────────────────

  describe('throwIfIntraTableConflict (keyword)', () => {
    it('allows unique phrase when table is empty', async () => {
      keywordRepo.findAll.mockResolvedValue([]);

      await expect(
        service.throwIfIntraTableConflict('keyword', 'ETF', null),
      ).resolves.toBeUndefined();
    });

    it('rejects duplicate phrase (case-insensitive)', async () => {
      keywordRepo.findAll.mockResolvedValue([makeKeyword('ETF')]);

      await expect(
        service.throwIfIntraTableConflict('keyword', 'etf', null),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows same phrase with different caseSensitive (intra)', async () => {
      // Intra-table ignores caseSensitive — same normalized phrase = conflict
      keywordRepo.findAll.mockResolvedValue([makeKeyword('ETF', false)]);

      await expect(
        service.throwIfIntraTableConflict('keyword', 'ETF', null),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows same phrase with different matchMode (intra)', async () => {
      // Intra-table ignores matchMode — same normalized phrase = conflict
      keywordRepo.findAll.mockResolvedValue([
        makeKeyword('war', false, 'exact'),
      ]);

      await expect(
        service.throwIfIntraTableConflict('keyword', 'war', null),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('excludes self when excludeId is provided (PATCH self-update)', async () => {
      const kw = makeKeyword('ETF');
      keywordRepo.findAll.mockResolvedValue([kw]);

      await expect(
        service.throwIfIntraTableConflict('keyword', 'ETF', null, kw.id),
      ).resolves.toBeUndefined();
    });

    it('detects conflict with different id (PATCH to existing phrase)', async () => {
      const existing = makeKeyword('ETF');
      const otherId = crypto.randomUUID();
      keywordRepo.findAll.mockResolvedValue([existing]);

      await expect(
        service.throwIfIntraTableConflict('keyword', 'ETF', null, otherId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('skips validation for compounds (andGroupId != null)', async () => {
      keywordRepo.findAll.mockResolvedValue([]);

      await expect(
        service.throwIfIntraTableConflict('keyword', 'ETF', 'some-group-uuid'),
      ).resolves.toBeUndefined();
    });
  });

  // ── Intra-table: blacklist ──────────────────────────────────────────

  describe('throwIfIntraTableConflict (blacklist)', () => {
    it('rejects duplicate phrase in blacklist', async () => {
      blacklistRepo.findAll.mockResolvedValue([makeBlacklist('war')]);

      await expect(
        service.throwIfIntraTableConflict('blacklist', 'war', null),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows unique blacklist phrase', async () => {
      blacklistRepo.findAll.mockResolvedValue([]);

      await expect(
        service.throwIfIntraTableConflict('blacklist', 'war', null),
      ).resolves.toBeUndefined();
    });
  });

  // ── Intra-table: different sourceChannelIds (the real bug) ─────────

  it('rejects duplicate even with different sourceChannelIds (the real bug)', async () => {
    // This was the original bug: same phrase "ETF" but different sourceChannelIds
    const kw1 = Keyword.create({ phrase: 'ETF', sourceChannelIds: ['chan-a'] });
    keywordRepo.findAll.mockResolvedValue([kw1]);

    await expect(
      service.throwIfIntraTableConflict('keyword', 'ETF', null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ── Cross-table validation ─────────────────────────────────────────

  describe('throwIfCrossTableConflict', () => {
    it('rejects keyword when phrase exists in blacklist (same settings)', async () => {
      blacklistRepo.findAll.mockResolvedValue([
        makeBlacklist('war', false, 'exact'),
      ]);

      await expect(
        service.throwIfCrossTableConflict(
          'keyword',
          'war',
          false,
          'exact',
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows keyword when blacklist has different caseSensitive', async () => {
      blacklistRepo.findAll.mockResolvedValue([
        makeBlacklist('War', true, 'exact'),
      ]);

      await expect(
        service.throwIfCrossTableConflict(
          'keyword',
          'war',
          false,
          'exact',
          null,
        ),
      ).resolves.toBeUndefined();
    });

    it('allows keyword when blacklist has different matchMode', async () => {
      blacklistRepo.findAll.mockResolvedValue([
        makeBlacklist('war', false, 'substring'),
      ]);

      await expect(
        service.throwIfCrossTableConflict(
          'keyword',
          'war',
          false,
          'exact',
          null,
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects blacklist when phrase exists in keyword (same settings)', async () => {
      keywordRepo.findAll.mockResolvedValue([
        makeKeyword('test', false, 'exact'),
      ]);

      await expect(
        service.throwIfCrossTableConflict(
          'blacklist',
          'test',
          false,
          'exact',
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows blacklist when keyword has different settings', async () => {
      keywordRepo.findAll.mockResolvedValue([
        makeKeyword('test', true, 'exact'),
      ]);

      await expect(
        service.throwIfCrossTableConflict(
          'blacklist',
          'test',
          false,
          'substring',
          null,
        ),
      ).resolves.toBeUndefined();
    });

    it('skips cross-table validation for compounds', async () => {
      keywordRepo.findAll.mockResolvedValue([
        makeKeyword('test', false, 'exact'),
      ]);

      await expect(
        service.throwIfCrossTableConflict(
          'blacklist',
          'test',
          false,
          'exact',
          'some-group-uuid',
        ),
      ).resolves.toBeUndefined();
    });
  });

  // ── throwIfDuplicate (combined) ────────────────────────────────────

  describe('throwIfDuplicate', () => {
    it('throws if intra-table conflict exists', async () => {
      keywordRepo.findAll.mockResolvedValue([makeKeyword('ETF')]);
      blacklistRepo.findAll.mockResolvedValue([]);

      await expect(
        service.throwIfDuplicate('keyword', 'ETF', false, 'exact', null),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws if cross-table conflict exists', async () => {
      keywordRepo.findAll.mockResolvedValue([]);
      blacklistRepo.findAll.mockResolvedValue([
        makeBlacklist('ETF', false, 'exact'),
      ]);

      await expect(
        service.throwIfDuplicate('keyword', 'ETF', false, 'exact', null),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes when both intra and cross are clear', async () => {
      keywordRepo.findAll.mockResolvedValue([]);
      blacklistRepo.findAll.mockResolvedValue([]);

      await expect(
        service.throwIfDuplicate('keyword', 'fresh', false, 'exact', null),
      ).resolves.toBeUndefined();
    });

    it('skips validation for compounds', async () => {
      keywordRepo.findAll.mockResolvedValue([makeKeyword('ETF')]);
      blacklistRepo.findAll.mockResolvedValue([
        makeBlacklist('ETF', false, 'exact'),
      ]);

      await expect(
        service.throwIfDuplicate(
          'keyword',
          'ETF',
          false,
          'exact',
          'group-uuid',
        ),
      ).resolves.toBeUndefined();
    });
  });
});
