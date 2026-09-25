import { ConflictException, Injectable } from '@nestjs/common';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';
import type { ThreadsMatchMode } from 'threads/publisher/domain/entities/threads-keyword.entity';

/**
 * Which table the caller is operating on.
 */
export type ThreadsPhraseTable = 'keyword' | 'blacklist';

/**
 * Application service: consolidated phrase duplicate validation for
 * the threads-publisher BC.
 *
 * Threads-typed mirror of the crypto-news `PhraseRegistryService`
 * (`telegram/crypto-news-publisher/application/services/
 * phrase-registry.service.ts`): same Phase 1 scope — only simple
 * phrases (`andGroupId === null`) are validated, compounds are
 * excluded entirely.
 *
 * Two kinds of duplication are checked:
 *
 * **Intra-table** — the same normalized phrase must not appear twice
 * in one table (ignoring `caseSensitive`, `matchMode`,
 * `sourceChannelIds`).
 *
 * **Cross-table** — the same normalized phrase must not appear in the
 * _other_ table with the **same** `caseSensitive` AND **same**
 * `matchMode`.
 */
@Injectable()
export class ThreadsPhraseRegistryService {
  public constructor(
    private readonly keywordRepo: ThreadsKeywordRepository,
    private readonly blacklistRepo: ThreadsBlacklistPhraseRepository,
  ) {}

  /**
   * Check that `phrase` is not already taken within its own table.
   *
   * Only simple phrases (`andGroupId === null`) are validated.
   * Compounds are silently skipped.
   *
   * @param andGroupId  When non-null the check is skipped (compound).
   * @param excludeId   When set, the row with this id is excluded
   *                    (used in PATCH to avoid a false self-match).
   * @throws ConflictException if a duplicate simple phrase is found.
   */
  public async throwIfIntraTableConflict(
    table: ThreadsPhraseTable,
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
   * Only simple phrases (`andGroupId === null`) are validated.
   * Compounds are silently skipped.
   *
   * @throws ConflictException if a matching entry is found cross-table.
   */
  public async throwIfCrossTableConflict(
    table: ThreadsPhraseTable,
    phrase: string,
    caseSensitive: boolean,
    matchMode: ThreadsMatchMode,
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
    table: ThreadsPhraseTable,
    phrase: string,
    caseSensitive: boolean,
    matchMode: ThreadsMatchMode,
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
    table: ThreadsPhraseTable,
  ): ThreadsKeywordRepository | ThreadsBlacklistPhraseRepository {
    return table === 'keyword' ? this.keywordRepo : this.blacklistRepo;
  }
}
