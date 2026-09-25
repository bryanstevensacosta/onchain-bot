import { Injectable } from '@nestjs/common';
import { ThreadsPromptTemplate } from 'threads/publisher/domain/entities/threads-prompt-template.entity';
import { ThreadsPromptTemplateRepository } from 'threads/publisher/application/ports/threads-prompt-template.repository';

/**
 * Canonical id of the seed template. Pinned: `ThreadsLlmConfig`
 * seeds (`InMemoryThreadsLlmConfigRepository`, future TypeORM
 * migration) bind `defaultTemplateId` to this value, and
 * `ThreadsLlmAdapter` falls back to it when `templateId` is null
 * or the referenced row is missing.
 */
export const THREADS_DEFAULT_TEMPLATE_ID = 'threads-default';

/**
 * Pinned seed values for the `threads-default` template — mirror of
 * the crypto-news seed (`LlmConfigMigrationService`
 * `MAX_TOKENS_DEFAULT = 2000`, `TEMPERATURE_DEFAULT = 0.7`;
 * `DEFAULT_CONFIG.prompt.model = 'opencode-zen/deepseek-v4-flash'`):
 * model/maxTokens/temperature pinned, `vision=false` (TEXT-only
 * MVP — media is stripped with a `media_skipped` log, never sent
 * to the model). Remaining columns mirror
 * `prompt-template.entity.ts:29` (name/description/reasoningEffort/
 * promptText/systemPromptText).
 *
 * The prompt body REQUIRES output `<500 chars` plain text with NO
 * Telegram formatting (no HTML/Markdown-TG, no markup modes) — the
 * adapter additionally truncates defensively to ≤500.
 */
export const THREADS_DEFAULT_TEMPLATE_SEED = {
  id: THREADS_DEFAULT_TEMPLATE_ID,
  name: 'Threads Default',
  description:
    'Seeded Threads default (TEXT-only, plain text under 500 chars, no Telegram formatting).',
  model: 'opencode-zen/deepseek-v4-flash',
  supportsVision: false,
  maxTokens: 2000,
  temperature: 0.7,
  reasoningEffort: null,
  promptText:
    'Rewrite the following crypto update as a single Threads post in plain text under 500 characters. ' +
    'Keep the facts, drop promo fluff. Rules: plain text only — NO HTML tags, NO Markdown, NO Telegram formatting ' +
    '(no markup modes, no photo posts). ' +
    'At most 2 hashtags.\n\n' +
    'Title: {{title}}\n\n' +
    'Original content: {{original}}\n\n' +
    'Output ONLY the post text (<500 chars).',
  systemPromptText: '',
} as const;

/**
 * Build the seed `ThreadsPromptTemplate` aggregate. Single source
 * of truth for the seed — the in-memory repo, the adapter fallback
 * path, and the future TypeORM migration (T4+) all share it.
 */
export function buildThreadsDefaultTemplate(): ThreadsPromptTemplate {
  return ThreadsPromptTemplate.create({ ...THREADS_DEFAULT_TEMPLATE_SEED });
}

/**
 * In-memory `ThreadsPromptTemplateRepository` for specs and local
 * wiring. Pre-seeded with the single `threads-default` template;
 * `save()` upserts by id, `delete()` hard-deletes.
 */
@Injectable()
export class InMemoryThreadsPromptTemplateRepository extends ThreadsPromptTemplateRepository {
  private readonly rows = new Map<string, ThreadsPromptTemplate>([
    [THREADS_DEFAULT_TEMPLATE_ID, buildThreadsDefaultTemplate()],
  ]);

  public async findAll(): Promise<ReadonlyArray<ThreadsPromptTemplate>> {
    return [...this.rows.values()];
  }

  public async findById(id: string): Promise<ThreadsPromptTemplate | null> {
    return this.rows.get(id) ?? null;
  }

  public async findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<ThreadsPromptTemplate>> {
    return ids
      .map((id) => this.rows.get(id) ?? null)
      .filter((row): row is ThreadsPromptTemplate => row !== null);
  }

  public async save(
    template: ThreadsPromptTemplate,
  ): Promise<ThreadsPromptTemplate> {
    this.rows.set(template.id, template);
    return template;
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
