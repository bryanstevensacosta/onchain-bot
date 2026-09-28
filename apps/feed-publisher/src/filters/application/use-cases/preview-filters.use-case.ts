import { Injectable } from '@nestjs/common';
import { ChannelFilterRepository } from '../ports/channel-filter.repository';

export interface FilterPreviewStepView {
  readonly filterId: string;
  readonly priority: number;
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly isActive: boolean;
  readonly applied: boolean;
  readonly skippedReason: string | null;
  readonly titleAfter: string | null;
  readonly contentAfter: string;
}

export interface FilterPreviewView {
  readonly channelId: string;
  readonly rawTitle: string | null;
  readonly rawContent: string;
  readonly filteredTitle: string | null;
  readonly filteredContent: string;
  readonly filtersApplied: number;
  readonly filtersTotal: number;
  readonly steps: ReadonlyArray<FilterPreviewStepView>;
}

/**
 * Faithful server-side filters preview (todo 18, gap filters.md §5.2).
 *
 * Replays the exact `ContentFilterService` chain for one channel —
 * priority ASC with creation-order tiebreak, title AND content, same
 * guard order (inactive → 512-char cap → flags whitelist → compilable)
 * — while tracing every step so the UX can show RAW versus filtered
 * side by side. Read-only: nothing persists, nothing enqueues.
 *
 * Trace-only deviation: the service compiles through a shared cache;
 * the preview compiles per step. Guard order and replacement semantics
 * are identical, so the final strings always agree.
 */
@Injectable()
export class PreviewFiltersUseCase {
  private readonly MAX_PATTERN_LENGTH = 512;

  public constructor(private readonly repo: ChannelFilterRepository) {}

  public async execute(input: {
    channelId: string;
    title: string | null;
    content: string;
  }): Promise<FilterPreviewView> {
    const all = await this.repo.findAll();
    const rules = all
      .filter((f) => f.channelId === input.channelId)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
    let title = input.title ?? null;
    let content = input.content;
    const steps: FilterPreviewStepView[] = [];
    let applied = 0;
    for (const rule of rules) {
      const base = {
        filterId: rule.id,
        priority: rule.priority,
        pattern: rule.pattern,
        replacement: rule.replacement,
        flags: rule.flags,
        isActive: rule.isActive,
      };
      if (!rule.isActive) {
        steps.push({
          ...base,
          applied: false,
          skippedReason: 'inactive',
          titleAfter: title,
          contentAfter: content,
        });
        continue;
      }
      if (rule.pattern.length > this.MAX_PATTERN_LENGTH) {
        steps.push({
          ...base,
          applied: false,
          skippedReason: 'pattern-too-long',
          titleAfter: title,
          contentAfter: content,
        });
        continue;
      }
      if (!/^[gimsuy]*$/.test(rule.flags)) {
        steps.push({
          ...base,
          applied: false,
          skippedReason: 'invalid-flags',
          titleAfter: title,
          contentAfter: content,
        });
        continue;
      }
      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, rule.flags);
      } catch {
        steps.push({
          ...base,
          applied: false,
          skippedReason: 'invalid-pattern',
          titleAfter: title,
          contentAfter: content,
        });
        continue;
      }
      try {
        title = title !== null ? title.replace(regex, rule.replacement) : null;
        content = content.replace(regex, rule.replacement);
      } catch {
        steps.push({
          ...base,
          applied: false,
          skippedReason: 'apply-failed',
          titleAfter: title,
          contentAfter: content,
        });
        continue;
      }
      applied += 1;
      steps.push({
        ...base,
        applied: true,
        skippedReason: null,
        titleAfter: title,
        contentAfter: content,
      });
    }
    return {
      channelId: input.channelId,
      rawTitle: input.title ?? null,
      rawContent: input.content,
      filteredTitle: title,
      filteredContent: content,
      filtersApplied: applied,
      filtersTotal: rules.length,
      steps,
    };
  }
}
