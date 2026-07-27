import { Injectable, ConflictException } from '@nestjs/common';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import type { MatchMode } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

/**
 * Which table the caller is operating on.
 */
export type PhraseTable = 'keyword' | 'blacklist';

/**
 * Application service: consolidated phrase duplicate validation for the
 * crypto-news-publisher BC.
 *
 * **Phase 1 scope** — only validates **simple** phrases (`andGroupId === null`).
 * Compound phrases (`andGroupId !== null`) are excluded entirely.
 *
 * Two kinds of duplication are checked:
 *
 * **Intra-table** — the same normalized phrase must not appear twice in
 * one table (ignoring `caseSensitive`, `matchMode`, `sourceChannelIds`).
 * If "ETF" already exists as a keyword, any new keyword with phrase "ETF"
 * is rejected — regardless of how the existing row's settings differ.
 *
 * **Cross-table** — the same normalized phrase must not appear in the
 * _other_ table with the **same** `caseSensitive` AND **same** `matchMode`.
 * This allows a phrase to exist on both sides only when the matching
 * settings differ (e.g. a case-insensitive keyword and a case-sensitive
 * blacklist entry with the same text can coexist).
 *
 * The phrase comparison is case-insensitive: "ETF" and "etf" are the same
 * phrase for intra-table purposes. For cross-table, `caseSensitive` is
 * compared by value, not by normalization.
 *
 * Compounds are not validated in Phase 1 so that existing AND-group
 * workflows are not disrupted.
 */
@Injectable()
export class PhraseRegistryService {
  public constructor(
    private readonly keywordRepo: KeywordRepository,
    private readonly blacklistRepo: BlacklistPhraseRepository,
  ) {}

  /**
   * Check that `phrase` is not already taken within its own table.
   *
   * Only simple phrases (`andGroupId === null`) are validated. Compounds
   * are silently skipped.
   *
   * @param andGroupId  When non-null the check is skipped (compound).
   * @param excludeId   When set, the row with this id is excluded
   *                    (used in PATCH to avoid a false self-match).
   * @throws ConflictException if a duplicate simple phrase is found.
   */
  public async throwIfIntraTableConflict(
    table: PhraseTable,
    phrase: string,
    andGroupId: string | null,
    excludeId?: string,
  ): Promise<void> {
    // Phase 1: skip validation for compounds entirely.
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

  /**
   * Check that `phrase` does NOT already exist in the opposite table
   * with the **same** `caseSensitive` AND `matchMode` values.
   *
   * Only simple phrases (`andGroupId === null`) are validated. Compounds
   * are silently skipped.
   *
   * @param table         The table the caller is writing to.
   * @param phrase        Raw phrase text.
   * @param caseSensitive Whether the new entry is case-sensitive.
   * @param matchMode     Whether the new entry uses `exact` or `substring`.
   * @param andGroupId    When non-null the check is skipped (compound).
   * @param excludeId     Optional id to exclude (self on PATCH).
   * @throws ConflictException if a matching entry is found cross-table.
   */
  public async throwIfCrossTableConflict(
    table: PhraseTable,
    phrase: string,
    caseSensitive: boolean,
    matchMode: MatchMode,
    andGroupId: string | null,
    excludeId?: string,
  ): Promise<void> {
    // Phase 1: skip validation for compounds entirely.
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

  /**
   * Convenience: run both intra-table and cross-table checks in sequence.
   *
   * @throws ConflictException on either violation.
   */
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

  // -- helpers --

  private resolveRepo(
    table: PhraseTable,
  ): KeywordRepository | BlacklistPhraseRepository {
    return table === 'keyword' ? this.keywordRepo : this.blacklistRepo;
  }
}
