import { ConflictException, Injectable } from '@nestjs/common';
import { KeywordRepository } from '../ports/keyword.repository';
import { BlacklistPhraseRepository } from '../ports/blacklist-phrase.repository';
import type { MatchMode } from '../../domain/match-mode';

export type PhraseTable = 'keyword' | 'blacklist';

/**
 * Consolidated duplicate validation for phrase writes (moved from backend).
 *
 * Phase-1 scope: simple phrases only (`andGroupId === null`); compounds
 * are excluded so AND-group workflows are never disrupted.
 * Intra-table: same normalized text may not appear twice in one table.
 * Cross-table: same text may not appear in the other table with identical
 * `caseSensitive` AND `matchMode` (differing settings may coexist).
 */
@Injectable()
export class PhraseRegistryService {
  public constructor(
    private readonly keywordRepo: KeywordRepository,
    private readonly blacklistRepo: BlacklistPhraseRepository,
  ) {}

  public async throwIfIntraTableConflict(
    table: PhraseTable,
    phrase: string,
    andGroupId: string | null,
    excludeId?: string,
  ): Promise<void> {
    if (andGroupId !== null) {
      return;
    }
    const repo = this.resolveRepo(table);
    const all = await repo.findAll();
    const normalized = phrase.trim().toLowerCase();
    const dup = all.find(
      (item) =>
        item.phrase.toLowerCase() === normalized &&
        item.andGroupId === null &&
        item.id !== excludeId,
    );
    if (dup) {
      const label = table === 'keyword' ? 'Keyword' : 'Blacklist phrase';
      throw new ConflictException(`${label} "${phrase}" already exists`);
    }
  }

  public async throwIfCrossTableConflict(
    table: PhraseTable,
    phrase: string,
    caseSensitive: boolean,
    matchMode: MatchMode,
    andGroupId: string | null,
    excludeId?: string,
  ): Promise<void> {
    if (andGroupId !== null) {
      return;
    }
    const normalized = phrase.trim().toLowerCase();
    if (table === 'keyword') {
      const all = await this.blacklistRepo.findAll();
      const dup = all.find(
        (item) =>
          item.phrase.toLowerCase() === normalized &&
          item.caseSensitive === caseSensitive &&
          item.matchMode === matchMode &&
          item.andGroupId === null &&
          item.id !== excludeId,
      );
      if (dup) {
        throw new ConflictException(
          `"${phrase}" is already blacklisted (caseSensitive: ${caseSensitive}, matchMode: ${matchMode})`,
        );
      }
    } else {
      const all = await this.keywordRepo.findAll();
      const dup = all.find(
        (item) =>
          item.phrase.toLowerCase() === normalized &&
          item.caseSensitive === caseSensitive &&
          item.matchMode === matchMode &&
          item.andGroupId === null &&
          item.id !== excludeId,
      );
      if (dup) {
        throw new ConflictException(
          `"${phrase}" is already a keyword (caseSensitive: ${caseSensitive}, matchMode: ${matchMode})`,
        );
      }
    }
  }

  public async throwIfDuplicate(
    table: PhraseTable,
    phrase: string,
    caseSensitive: boolean,
    matchMode: MatchMode,
    andGroupId: string | null,
    excludeId?: string,
  ): Promise<void> {
    await this.throwIfIntraTableConflict(table, phrase, andGroupId, excludeId);
    await this.throwIfCrossTableConflict(
      table,
      phrase,
      caseSensitive,
      matchMode,
      andGroupId,
      excludeId,
    );
  }

  private resolveRepo(
    table: PhraseTable,
  ): KeywordRepository | BlacklistPhraseRepository {
    return table === 'keyword' ? this.keywordRepo : this.blacklistRepo;
  }
}
