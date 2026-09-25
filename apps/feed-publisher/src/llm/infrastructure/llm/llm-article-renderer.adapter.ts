import { Injectable } from '@nestjs/common';
import { LlmFailedError } from 'shared/exceptions/feed-publisher.error';
import { QueuedArticleRendererPort } from '../../../queue/application/ports/queued-article-renderer.port';
import type { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';
import { FeedLlmGenerator } from './feed-llm-generator.adapter';
import { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import { findNonLatinCharacter } from '../../application/services/latin-script-validator';

/**
 * Drain-path renderer: LLM gateway when the flags say so, raw content
 * otherwise (moved from backend crypto-news-publisher, todo 5).
 *
 * C-FLAGS-01: generation ONLY when `llmEnabled AND publishingEnabled`
 * (else raw passthrough — no provider cost for content that never
 * ships). Generated text is validated: empty output and (when
 * `rejectNonLatin`) non-Latin scripts throw `LlmFailedError`, which the
 * drain use-case retries to `llmMaxAttempts` then marks FAILED.
 *
 * LIVE binding for `QueuedArticleRendererPort` since todo 5 (replaces
 * the raw-only adapter; raw mode is preserved via the flags).
 */
@Injectable()
export class LlmArticleRendererAdapter extends QueuedArticleRendererPort {
  public constructor(
    private readonly generator: FeedLlmGenerator,
    private readonly llmConfigRepo: LlmConfigRepository,
  ) {
    super();
  }

  public async render(
    entry: PublisherQueueEntry,
  ): Promise<{ readonly content: string }> {
    const cfg = await this.llmConfigRepo.load();
    if (!cfg.shouldGenerateLlm()) {
      return { content: entry.rawContent };
    }
    const generated = await this.generator.generateForEntry(entry);
    if (typeof generated.content !== 'string' || generated.content.trim().length === 0) {
      throw new LlmFailedError(
        `LLM returned empty content (model=${generated.model})`,
      );
    }
    if (cfg.rejectNonLatin) {
      const bad = findNonLatinCharacter(generated.content);
      if (bad) {
        const code = bad.codePoint.toString(16).toUpperCase().padStart(4, '0');
        throw new LlmFailedError(
          `LLM output rejected: non-Latin character '${bad.char}' (U+${code}) detected`,
        );
      }
    }
    return { content: generated.content };
  }
}
