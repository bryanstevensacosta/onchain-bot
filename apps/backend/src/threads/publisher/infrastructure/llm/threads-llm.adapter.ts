import { Injectable, Logger } from '@nestjs/common';
import { LlmPort } from 'shared/llm';
import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';
import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';
import { ThreadsPromptTemplateRepository } from 'threads/publisher/application/ports/threads-prompt-template.repository';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import {
  THREADS_DEFAULT_TEMPLATE_ID,
  buildThreadsDefaultTemplate,
} from 'threads/publisher/application/repositories/in-memory-threads-prompt-template.repository';

/**
 * Threads-specific wrapper around the shared `LlmPort`.
 *
 * Canonical prompt owner for the threads-publisher pipeline going
 * forward (T2's `ProcessNextThreadsArticleUseCase` still calls
 * `llmPort.generateText` directly with an inline prompt — that call
 * path is left intact; new callers should use this adapter so the
 * `<500 chars` plain-text prompt lives in ONE place).
 *
 * Responsibilities (vs the generic LlmPort):
 *  - Resolve the right `ThreadsPromptTemplate` for the entry: the
 *    keyword-bound id (`entry.keywordTemplateId`) takes precedence;
 *    when null, falls back to `ThreadsLlmConfig.defaultTemplateId`
 *    (the `templateId|null` fallback). A missing row falls back to
 *    the ephemeral `threads-default` seed (warn-logged) instead of
 *    throwing, so a deleted template can never wedge the queue.
 *  - Substitute `{{title}}`, `{{original}}`, `{{hasImage}}` from the
 *    queue entry into the template's `promptText` in a single regex
 *    pass (not chained `.replace()`).
 *  - TEXT-only MVP: media is NEVER sent to the model (no vision
 *    requirement — the seed pins `supportsVision=false`). An entry
 *    carrying `imagePath` logs `media_skipped` and renders
 *    `{{hasImage}}` as `no`.
 *  - Forward the template's per-call knobs (`model`, `maxTokens`,
 *    `temperature`, `reasoningEffort`) into the
 *    `LlmPort.generateText` call.
 *  - Retry transient LLM failures up to `llmMaxAttempts` from config;
 *    content-blocking failures (shared `isBlockingFailureReason()`)
 *    throw immediately. A timeout therefore surfaces as a
 *    reintentable FAILED at the caller (never blocking).
 *  - Enforce the Threads constraint defensively: strip Telegram HTML
 *    tags and truncate output to ≤500 chars (`slice(0, 499) + '…'`).
 *    NO Bot API formatting is ever added (no photo sending, no markup
 *    modes, no per-post channel routing).
 */
@Injectable()
export class ThreadsLlmAdapter {
  /**
   * Hard Threads post limit. The prompt REQUIRES `<500 chars`;
   * this constant is the defensive enforcement (truncate, never
   * reject — enqueue must never fail on length).
   */
  public static readonly MAX_OUTPUT_CHARS = 500;

  private readonly logger = new Logger(ThreadsLlmAdapter.name);

  public constructor(
    private readonly llmPort: LlmPort,
    private readonly templateRepo: ThreadsPromptTemplateRepository,
    private readonly llmConfigRepo: ThreadsLlmConfigRepository,
  ) {}

  /**
   * Generate a plain-text Threads post (≤500 chars) for the given
   * queue entry. Returns the LLM-generated text along with metadata
   * about the generation (prompts, temperature, reasoning effort).
   */
  public async generateForEntry(entry: ThreadsQueueEntry): Promise<{
    content: string;
    systemPrompt: string | null;
    userPrompt: string;
    temperature: number | null;
    reasoningEffort: string | null;
    model: string;
  }> {
    if (process.env.USE_MOCK_AI === 'true') {
      this.logger.log(
        'USE_MOCK_AI active — returning raw content, skipping LLM call',
      );
      return {
        content: entry.rawContent,
        systemPrompt: null,
        userPrompt: '[mock-mode]',
        temperature: null,
        reasoningEffort: null,
        model: 'mock',
      };
    }

    const cfg = await this.llmConfigRepo.load();
    const templateId = entry.keywordTemplateId ?? cfg.defaultTemplateId;
    const template =
      (await this.templateRepo.findById(templateId)) ??
      (await this.resolveSeedFallback(templateId));
    const prompt = renderPrompt(template.promptText, entry);
    const systemPrompt = template.systemPromptText.trim();

    if (entry.imagePath) {
      this.logger.log(
        `media_skipped for entry ${entry.id}: TEXT-only MVP drops image ${entry.imagePath}`,
      );
    }

    const maxAttempts = Math.max(1, cfg.llmMaxAttempts);
    let content: string | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const raw = await this.llmPort.generateText({
          prompt,
          ...(systemPrompt ? { systemPrompt } : {}),
          imageUrl: undefined,
          imageBase64: undefined,
          mimeType: undefined,
          model: template.model,
          maxTokens: template.maxTokens,
          temperature: template.temperature,
          ...(template.reasoningEffort
            ? { reasoningEffort: template.reasoningEffort }
            : {}),
        });
        content = raw;
        break;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (isBlockingFailureReason(message)) {
          throw err;
        }
        if (attempt < maxAttempts) {
          this.logger.warn(
            `LLM attempt ${attempt}/${maxAttempts} failed (reintentable): ${message}`,
          );
        }
      }
    }
    if (content === null) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`LLM generation failed: ${String(lastError)}`);
    }

    return {
      content: enforceThreadsConstraints(content),
      systemPrompt: systemPrompt || null,
      userPrompt: prompt,
      temperature: template.temperature,
      reasoningEffort: template.reasoningEffort,
      model: template.model,
    };
  }

  /**
   * Exposed for tests: re-render a template body with the same
   * single-regex-pass logic the adapter uses at runtime.
   */
  public renderPromptFor(
    templatePromptText: string,
    entry: ThreadsQueueEntry,
  ): string {
    return renderPrompt(templatePromptText, entry);
  }

  /**
   * Fallback for a missing template row: prefer the persisted
   * `threads-default` seed; when even that is gone (deleted via a
   * future CRUD path), build it ephemerally so generation never
   * wedges the queue. Always warn-logs so the operator notices.
   */
  private async resolveSeedFallback(requestedId: string) {
    this.logger.warn(
      `PromptTemplate not found: ${requestedId} — falling back to ${THREADS_DEFAULT_TEMPLATE_ID}`,
    );
    if (requestedId !== THREADS_DEFAULT_TEMPLATE_ID) {
      const seeded =
        await this.templateRepo.findById(THREADS_DEFAULT_TEMPLATE_ID);
      if (seeded) {
        return seeded;
      }
    }
    this.logger.warn(
      `Seed template ${THREADS_DEFAULT_TEMPLATE_ID} missing — using ephemeral in-code seed`,
    );
    return buildThreadsDefaultTemplate();
  }
}

/**
 * Substitute the template placeholders in `templatePromptText`
 * using values from the queue entry. Done in one `.replace()` pass
 * (with a regex + function callback). TEXT-only MVP: `hasImage` is
 * always `no` (media is stripped with a `media_skipped` log, never
 * sent to the model).
 */
export const renderPrompt = (
  templatePromptText: string,
  entry: ThreadsQueueEntry,
): string => {
  return templatePromptText.replace(
    /\{\{(title|original|hasImage)\}\}/g,
    (_match, key: string) => {
      switch (key) {
        case 'title':
          return entry.rawTitle ?? '';
        case 'original':
          return entry.rawContent;
        case 'hasImage':
          return 'no';
        default:
          return _match;
      }
    },
  );
};

/**
 * Telegram HTML tags the model may echo despite the plain-text
 * instruction (`<b>`, `<i>`, link tags, …). Stripped
 * defensively — the Threads API takes raw text, never
 * markup-mode HTML.
 */
const TELEGRAM_HTML_TAG_PATTERN =
  /<\/?(?:b|i|u|s|strike|del|code|pre|br)(?:\s[^>]*)?>|<a(?:\s[^>]*)?>|<\/a>/gi;

/**
 * Defensive output enforcement: strip Telegram HTML tags, trim,
 * and truncate to `MAX_OUTPUT_CHARS` (`slice(0, 499) + '…'` —
 * never reject on length).
 */
export const enforceThreadsConstraints = (raw: string): string => {
  const plain = raw.replace(TELEGRAM_HTML_TAG_PATTERN, '').trim();
  if (plain.length <= ThreadsLlmAdapter.MAX_OUTPUT_CHARS) {
    return plain;
  }
  return `${plain.slice(0, ThreadsLlmAdapter.MAX_OUTPUT_CHARS - 1)}…`;
};
