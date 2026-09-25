import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { LlmFailedError } from 'shared/exceptions/feed-publisher.error';
import type { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';
import { LlmPort } from '../../application/ports/llm.port';
import { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import { PromptTemplateRepository } from '../../domain/ports/prompt-template.repository';

/**
 * Feed LLM generator (moved from backend crypto-news-publisher, todo 5).
 *
 * Resolves the right `PromptTemplate` per entry (keyword-bound id wins,
 * else `LlmConfig.defaultTemplateId`), renders `{{title}}` /
 * `{{original}}` / `{{hasImage}}` in one regex pass, and forwards the
 * template knobs (model/maxTokens/temperature/reasoningEffort) so one
 * gateway serves every template. `USE_MOCK_AI=true` short-circuits to
 * raw content without touching the provider. Gateway failures surface
 * as `LlmFailedError` — the drain path retries to `llmMaxAttempts`
 * then marks FAILED (cron retry). Missing local images degrade
 * fail-open (text-only generation).
 */
@Injectable()
export class FeedLlmGenerator {
  private readonly logger = new Logger(FeedLlmGenerator.name);

  public constructor(
    private readonly llmPort: LlmPort,
    private readonly templateRepo: PromptTemplateRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
  ) {}

  public async generateForEntry(entry: PublisherQueueEntry): Promise<{
    content: string;
    systemPrompt: string | null;
    userPrompt: string;
    temperature: number | null;
    reasoningEffort: string | null;
    model: string;
  }> {
    if (process.env.USE_MOCK_AI === 'true') {
      this.logger.log('USE_MOCK_AI active — returning raw content, skipping LLM call');
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
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new LlmFailedError(
        `PromptTemplate not found: ${templateId} (set as default in LlmConfig)`,
      );
    }
    const prompt = renderPrompt(template.promptText, entry);
    const systemPrompt = template.systemPromptText.trim();
    const useVision = template.supportsVision;
    const { base64, mimeType } = useVision
      ? this.readImagePayload(entry)
      : { base64: undefined, mimeType: undefined };
    try {
      const content = await this.llmPort.generateText({
        prompt,
        ...(systemPrompt ? { systemPrompt } : {}),
        imageUrl: undefined,
        imageBase64: base64,
        mimeType,
        model: template.model,
        maxTokens: template.maxTokens,
        temperature: template.temperature,
        ...(template.reasoningEffort
          ? { reasoningEffort: template.reasoningEffort }
          : {}),
      });
      return {
        content,
        systemPrompt: systemPrompt || null,
        userPrompt: prompt,
        temperature: template.temperature,
        reasoningEffort: template.reasoningEffort,
        model: template.model,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isVisionError =
        errorMsg.includes('image input') ||
        errorMsg.includes('vision') ||
        errorMsg.includes('No endpoints found') ||
        errorMsg.includes('does not support image') ||
        errorMsg.includes('vision model');
      if (useVision && isVisionError && base64) {
        this.logger.warn(
          `Model ${template.model} does not support vision, disabling and retrying without image`,
        );
        template.update({ supportsVision: false });
        await this.templateRepo.save(template);
        try {
          const content = await this.llmPort.generateText({
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
          return {
            content,
            systemPrompt: systemPrompt || null,
            userPrompt: prompt,
            temperature: template.temperature,
            reasoningEffort: template.reasoningEffort,
            model: template.model,
          };
        } catch (retryErr) {
          throw new LlmFailedError(
            retryErr instanceof Error ? retryErr.message : String(retryErr),
          );
        }
      }
      if (err instanceof LlmFailedError) throw err;
      throw new LlmFailedError(errorMsg);
    }
  }

  /** Exposed for tests + playground: same render path as generation. */
  public renderPromptFor(templatePromptText: string, entry: PublisherQueueEntry): string {
    return renderPrompt(templatePromptText, entry);
  }

  private readImagePayload(entry: PublisherQueueEntry): {
    base64: string | undefined;
    mimeType: string | undefined;
  } {
    const imagePath = entry.imagePaths[0];
    if (!imagePath) {
      return { base64: undefined, mimeType: undefined };
    }
    try {
      const bytes = readFileSync(imagePath);
      return { base64: bytes.toString('base64'), mimeType: inferMimeType(imagePath) };
    } catch (err) {
      this.logger.warn(
        `failed to read image at ${imagePath}: ${(err as Error).message}`,
      );
      return { base64: undefined, mimeType: undefined };
    }
  }
}

/**
 * Single-regex-pass placeholder substitution (`{{title}}`,
 * `{{original}}`, `{{hasImage}}`). Null titles render as empty string;
 * `hasImage` reflects `imagePaths.length > 0`.
 */
export const renderPrompt = (
  templatePromptText: string,
  entry: PublisherQueueEntry,
): string => {
  const hasImage = entry.imagePaths.length > 0 ? 'sí' : 'no';
  return templatePromptText.replace(
    /\{\{(title|original|hasImage)\}\}/g,
    (_match, key: string) => {
      switch (key) {
        case 'title':
          return entry.rawTitle ?? '';
        case 'original':
          return entry.rawContent;
        case 'hasImage':
          return hasImage;
        default:
          return _match;
      }
    },
  );
};

const inferMimeType = (filePath: string): string => {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
};
