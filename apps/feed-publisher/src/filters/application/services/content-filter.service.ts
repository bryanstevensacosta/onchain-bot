import { Injectable, Logger } from '@nestjs/common';
import type { ChannelFilterRule } from '../ports/channel-filter.repository';

/**
 * Rule accepted by the filter service (domain rules satisfy this shape).
 */
export interface FilterRule {
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly priority: number;
  readonly isActive: boolean;
}

/**
 * ReDoS-safe regex transforms, applied on-read (never persisted).
 *
 * Guards per rule, in order:
 * 1. inactive rules skipped;
 * 2. patterns longer than MAX_PATTERN_LENGTH skipped (pathological input);
 * 3. flags outside [gimsuy] skipped;
 * 4. uncompilable patterns logged + skipped (cached per pattern+flags);
 * 5. post-replace elapsed time measured against TIMEOUT_MS — overruns are
 *    logged as warnings and the (completed) result is kept.
 *
 * Note on the timeout: `String.replace` is synchronous, so true preemption
 * is impossible in single-threaded JS. The elapsed check after completion
 * plus the length/validity guards above keep a catastrophic pattern from
 * silently hanging the cron: overruns surface as warnings in the tick logs
 * and the offending pattern is identifiable by priority. Patterns that
 * need hard isolation belong in a worker (out of scope for todo 3).
 */
@Injectable()
export class ContentFilterService {
  private readonly logger = new Logger(ContentFilterService.name);
  private readonly TIMEOUT_MS = 100;
  private readonly MAX_PATTERN_LENGTH = 512;
  private readonly MAX_CACHE_ENTRIES = 200;
  private readonly compiled = new Map<string, RegExp | null>();

  public get timeoutMs(): number {
    return this.TIMEOUT_MS;
  }

  public filterContent(
    content: string,
    filters: ReadonlyArray<FilterRule | ChannelFilterRule>,
  ): string {
    if (!content || content.length === 0) {
      return content;
    }
    const active = filters
      .filter((f) => f.isActive)
      .sort((a, b) => a.priority - b.priority);
    if (active.length === 0) {
      return content;
    }
    let result = content;
    for (const filter of active) {
      result = this.applyFilter(result, filter);
    }
    return result;
  }

  public filterTitleAndContent(
    title: string | null,
    content: string,
    filters: ReadonlyArray<FilterRule | ChannelFilterRule>,
  ): { title: string | null; content: string } {
    return {
      title: title !== null ? this.filterContent(title, filters) : null,
      content: this.filterContent(content, filters),
    };
  }

  public getCacheSize(): number {
    return this.compiled.size;
  }

  private applyFilter(
    content: string,
    filter: FilterRule | ChannelFilterRule,
  ): string {
    if (filter.pattern.length > this.MAX_PATTERN_LENGTH) {
      this.logger.warn(
        `Filter pattern exceeds ${this.MAX_PATTERN_LENGTH} chars (priority=${filter.priority}); skipping`,
      );
      return content;
    }
    if (!/^[gimsuy]*$/.test(filter.flags)) {
      this.logger.warn(
        `Invalid regex flags "${filter.flags}" (priority=${filter.priority}); skipping`,
      );
      return content;
    }
    const regex = this.compile(filter.pattern, filter.flags, filter.priority);
    if (!regex) {
      return content;
    }
    const startTime = Date.now();
    try {
      const result = content.replace(regex, filter.replacement);
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

  private compile(
    pattern: string,
    flags: string,
    priority: number,
  ): RegExp | null {
    const key = `${flags}\u0000${pattern}`;
    const cached = this.compiled.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let regex: RegExp | null = null;
    try {
      regex = new RegExp(pattern, flags);
    } catch (err) {
      this.logger.warn(
        `Invalid regex pattern in filter (priority=${priority}): ${pattern}. Error: ${(err as Error).message}`,
      );
    }
    if (this.compiled.size >= this.MAX_CACHE_ENTRIES) {
      const oldest = this.compiled.keys().next();
      if (!oldest.done) {
        this.compiled.delete(oldest.value);
      }
    }
    this.compiled.set(key, regex);
    return regex;
  }
}
