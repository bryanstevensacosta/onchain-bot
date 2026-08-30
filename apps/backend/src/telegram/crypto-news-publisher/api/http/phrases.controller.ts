import { Controller, Get, ParseBoolPipe, Query } from '@nestjs/common';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import type { MatchMode } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

export interface ConflictCheckResult {
  readonly exists: boolean;
  readonly asKeyword: boolean;
  readonly asBlacklist: boolean;
  readonly details: {
    readonly keyword?: {
      id: string;
      phrase: string;
      caseSensitive: boolean;
      matchMode: MatchMode;
    };
    readonly blacklist?: {
      id: string;
      phrase: string;
      caseSensitive: boolean;
      matchMode: MatchMode;
    };
  };
}

export interface PhraseEntry {
  readonly id: string;
  readonly phrase: string;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly caseSensitive: boolean;
  readonly matchMode: MatchMode;
  readonly table: 'keyword' | 'blacklist';
  readonly createdAt: string;
}

/**
 * Read-only REST API for unified phrase management.
 *
 * Endpoints (all under `/crypto-news-publisher/phrases`):
 *  - GET /              List ALL phrases (keywords + blacklist) sorted by createdAt desc
 *  - GET /search        Search phrases by text across both tables
 *  - GET /conflict-check  Check if a phrase would conflict with existing entries
 */
@Controller('crypto-news-publisher/phrases')
export class PhrasesController {
  public constructor(
    private readonly keywordRepo: KeywordRepository,
    private readonly blacklistRepo: BlacklistPhraseRepository,
  ) {}

  @Get()
  public async list(): Promise<ReadonlyArray<PhraseEntry>> {
    const [keywords, blacklist] = await Promise.all([
      this.keywordRepo.findAll(),
      this.blacklistRepo.findAll(),
    ]);

    const mapped: PhraseEntry[] = [
      ...keywords.map((k) => ({
        id: k.id,
        phrase: k.phrase,
        sourceChannelIds: [...k.sourceChannelIds],
        enabled: k.enabled,
        andGroupId: k.andGroupId,
        requireMedia: k.requireMedia,
        caseSensitive: k.caseSensitive,
        matchMode: k.matchMode,
        table: 'keyword' as const,
        createdAt: k.createdAt.toISOString(),
      })),
      ...blacklist.map((b) => ({
        id: b.id,
        phrase: b.phrase,
        sourceChannelIds: [...b.sourceChannelIds],
        enabled: b.enabled,
        andGroupId: b.andGroupId,
        requireMedia: b.requireMedia,
        caseSensitive: b.caseSensitive,
        matchMode: b.matchMode,
        table: 'blacklist' as const,
        createdAt: b.createdAt.toISOString(),
      })),
    ];

    mapped.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return mapped;
  }

  @Get('search')
  public async search(
    @Query('q') q: string,
    @Query('table') table?: 'keyword' | 'blacklist',
  ): Promise<ReadonlyArray<PhraseEntry>> {
    const [keywords, blacklist] = await Promise.all([
      this.keywordRepo.findAll(),
      this.blacklistRepo.findAll(),
    ]);

    const normalizedQuery = (q ?? '').trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const mapKeyword = (k: (typeof keywords)[number]) =>
      ({
        id: k.id,
        phrase: k.phrase,
        sourceChannelIds: [...k.sourceChannelIds],
        enabled: k.enabled,
        andGroupId: k.andGroupId,
        requireMedia: k.requireMedia,
        caseSensitive: k.caseSensitive,
        matchMode: k.matchMode,
        table: 'keyword' as const,
        createdAt: k.createdAt.toISOString(),
      }) satisfies PhraseEntry;

    const mapBlacklist = (b: (typeof blacklist)[number]) =>
      ({
        id: b.id,
        phrase: b.phrase,
        sourceChannelIds: [...b.sourceChannelIds],
        enabled: b.enabled,
        andGroupId: b.andGroupId,
        requireMedia: b.requireMedia,
        caseSensitive: b.caseSensitive,
        matchMode: b.matchMode,
        table: 'blacklist' as const,
        createdAt: b.createdAt.toISOString(),
      }) satisfies PhraseEntry;

    const matches = (phrase: string): boolean =>
      phrase.toLowerCase().includes(normalizedQuery);

    const results: PhraseEntry[] = [];

    if (!table || table === 'keyword') {
      for (const k of keywords) {
        if (matches(k.phrase)) results.push(mapKeyword(k));
      }
    }
    if (!table || table === 'blacklist') {
      for (const b of blacklist) {
        if (matches(b.phrase)) results.push(mapBlacklist(b));
      }
    }

    return results;
  }

  @Get('conflict-check')
  public async conflictCheck(
    @Query('phrase') phrase: string,
    @Query('caseSensitive', new ParseBoolPipe({ optional: true }))
    caseSensitive?: boolean,
    @Query('matchMode') matchMode?: MatchMode,
  ): Promise<ConflictCheckResult> {
    const [keywords, blacklist] = await Promise.all([
      this.keywordRepo.findAll(),
      this.blacklistRepo.findAll(),
    ]);

    const normalized = (phrase ?? '').trim().toLowerCase();
    const cs = caseSensitive ?? false;
    const mm = matchMode ?? 'exact';

    const matchingKeyword = keywords.find(
      (k) =>
        k.phrase.toLowerCase() === normalized &&
        k.caseSensitive === cs &&
        k.matchMode === mm &&
        k.andGroupId === null,
    );
    const matchingBlacklist = blacklist.find(
      (b) =>
        b.phrase.toLowerCase() === normalized &&
        b.caseSensitive === cs &&
        b.matchMode === mm &&
        b.andGroupId === null,
    );

    return {
      exists: !!matchingKeyword || !!matchingBlacklist,
      asKeyword: !!matchingKeyword,
      asBlacklist: !!matchingBlacklist,
      details: {
        keyword: matchingKeyword
          ? {
              id: matchingKeyword.id,
              phrase: matchingKeyword.phrase,
              caseSensitive: matchingKeyword.caseSensitive,
              matchMode: matchingKeyword.matchMode,
            }
          : undefined,
        blacklist: matchingBlacklist
          ? {
              id: matchingBlacklist.id,
              phrase: matchingBlacklist.phrase,
              caseSensitive: matchingBlacklist.caseSensitive,
              matchMode: matchingBlacklist.matchMode,
            }
          : undefined,
      },
    };
  }
}
