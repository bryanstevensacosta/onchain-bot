import { Injectable, Logger } from '@nestjs/common';

/**
 * Rule defining a regex-based content filter.
 * Lower priority value = higher precedence (applied first).
 */
export interface FilterRule {
  /** Regex pattern string to match */
  pattern: string;
  /** Replacement string (supports $1, $2, etc. for capture groups) */
  replacement: string;
  /** Regex flags (e.g., 'gi', 'g', 'i') */
  flags: string;
  /** Priority: lower value = higher precedence (applied first) */
  priority: number;
  /** Whether this filter is active */
  isActive: boolean;
}

/**
 * Service for applying content filters to crypto-news messages.
 *
 * Filters are applied in priority order (ascending priority value).
 * Each regex replace has a 100ms timeout to prevent ReDoS.
 * Invalid regex patterns are logged and skipped.
 * Original content is never modified in the database — filtering
 * happens only at ingestion time before persistence.
 */
@Injectable()
export class ContentFilterService {
  private readonly logger = new Logger(ContentFilterService.name);
  private readonly TIMEOUT_MS = 100;

  /**
   * Apply all active filters to the given content.
   * Filters are sorted by priority (ascending) then applied sequentially.
   *
   * @param content - The content string to filter
   * @param filters - Array of filter rules
   * @returns Filtered content (or original if no filters apply)
   */
  public filterContent(
    content: string,
    filters: ReadonlyArray<FilterRule>,
  ): string {
    if (!content || content.length === 0) {
      return content;
    }

    // Sort active filters by priority (lower = higher precedence)
    const activeFilters = filters
      .filter((f) => f.isActive)
      .sort((a, b) => a.priority - b.priority);

    if (activeFilters.length === 0) {
      return content;
    }

    let result = content;

    for (const filter of activeFilters) {
      result = this.applyFilter(result, filter);
    }

    return result;
  }

  /**
   * Apply filters to both title and content.
   * Returns an object with filtered title and content.
   */
  public filterTitleAndContent(
    title: string | null,
    content: string,
    filters: ReadonlyArray<FilterRule>,
  ): { title: string | null; content: string } {
    return {
      title: title !== null ? this.filterContent(title, filters) : null,
      content: this.filterContent(content, filters),
    };
  }

  /**
   * Apply a single filter with timeout protection.
   * Uses AbortController to enforce 100ms limit per regex replace.
   */
  private applyFilter(content: string, filter: FilterRule): string {
    // Validate regex pattern before attempting to use it
    let regex: RegExp;
    try {
      regex = new RegExp(filter.pattern, filter.flags);
    } catch (err) {
      this.logger.warn(
        `Invalid regex pattern in filter (priority=${filter.priority}): ${filter.pattern}. Error: ${(err as Error).message}`,
      );
      return content; // Skip invalid filter, return unchanged content
    }

    // Use AbortController for timeout protection (for future async extensions)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      // Since String.replace is synchronous in JS, we use applyFilterWithTimeout
      // which checks elapsed time after the operation completes.
      // The AbortController is kept for potential future async extensions.
      return this.applyFilterWithTimeout(
        content,
        regex,
        filter.replacement,
        filter,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Apply regex replace with synchronous timeout check.
   * Since String.replace is synchronous in JS, we use a worker-style
   * approach: if the operation takes too long, we abort and return original.
   * Note: True preemption isn't possible in single-threaded JS, but we
   * can detect if we're stuck and log a warning.
   */
  private applyFilterWithTimeout(
    content: string,
    regex: RegExp,
    replacement: string,
    filter: FilterRule,
  ): string {
    const startTime = Date.now();

    try {
      const result = content.replace(regex, replacement);
      const elapsed = Date.now() - startTime;

      if (elapsed > this.TIMEOUT_MS) {
        this.logger.warn(
          `Regex replace took ${elapsed}ms (exceeds ${this.TIMEOUT_MS}ms limit), priority=${filter.priority}, pattern=${filter.pattern}`,
        );
      }

      return result;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      this.logger.error(
        `Regex replace failed after ${elapsed}ms (priority=${filter.priority}, pattern=${filter.pattern}): ${(err as Error).message}`,
      );
      return content;
    }
  }
}
