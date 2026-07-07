import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { LlmPort } from 'shared/llm';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

/**
 * Crypto-news-specific wrapper around the shared `LlmPort`.
 *
 * Responsibilities (vs the generic LlmPort):
 *  - Resolve the right `PromptTemplate` for the entry: the
 *    keyword-bound id (`entry.keywordTemplateId`) takes precedence;
 *    when null, falls back to `LlmConfig.defaultTemplateId`.
 *  - Substitute `{{title}}`, `{{original}}`, `{{hasImage}}` from the
 *    queue entry into the template's `promptText` in a single regex
 *    pass (not chained `.replace()`).
 *  - If the entry has a local `imagePath`, read the bytes, base64-
 *    encode them, and pass them to the underlying LlmPort so the
 *    model can use the image as multimodal context. The file is
 *    already on disk (downloaded at ingest time by the crypto-news
 *    listener) — Telegram CDN URLs are NOT used here (they expire
 *    after ~1h; the queue may not be drained for hours).
 *  - Forward the template's per-call knobs (`model`, `maxTokens`,
 *    `temperature`, `reasoningEffort`) into the `LlmPort.generateText`
 *    call so a single physical gateway can serve many template
 *    variants without restarting.
 */
@Injectable()
export class CryptoNewsLlmAdapter {
  private readonly logger = new Logger(CryptoNewsLlmAdapter.name);

  public constructor(
    private readonly llmPort: LlmPort,
    private readonly templateRepo: PromptTemplateRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
  ) {}

  /**
   * Generate a refined Spanish-language post for the given queue
   * entry. Returns the LLM-generated text (caption). Throws when the
   * resolved template row is missing (config error — the default or
   * keyword-bound id points at a non-existent template) so the
   * operator notices from the queue's FAILED transitions rather than
   * silently using an empty prompt.
   */
  public async generateForEntry(entry: PublisherQueueEntry): Promise<string> {
    const cfg = await this.llmConfigRepo.load();
    const templateId = entry.keywordTemplateId ?? cfg.defaultTemplateId;
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new Error(
        `PromptTemplate not found: ${templateId} (set as default in LlmConfig)`,
      );
    }
    const prompt = renderPrompt(template.promptText, entry);
    const { base64, mimeType } = this.readImagePayload(entry);

    return this.llmPort.generateText({
      prompt,
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
  }

  /**
   * Exposed for tests: re-render a template body with the same
   * single-regex-pass logic the adapter uses at runtime.
   */
  public renderPromptFor(
    templatePromptText: string,
    entry: PublisherQueueEntry,
  ): string {
    return renderPrompt(templatePromptText, entry);
  }

  /**
   * Read the local image file referenced by `entry.imagePath` and
   * return a base64 payload + MIME type. Returns empty values when
   * the entry has no image (the LlmPort ignores those fields when
   * `imageBase64` is undefined).
   *
   * MIME is inferred from the file extension. Telegram's media
   * downloader persists photos as `.jpg` / `.png` / `.webp` / `.gif`
   * (see `MtprotoMediaDownloader`); unknown extensions fall back to
   * `image/jpeg` since the OpenAI multimodal API accepts that MIME
   * for most photo formats.
   */
  private readImagePayload(entry: PublisherQueueEntry): {
    base64: string | undefined;
    mimeType: string | undefined;
  } {
    const imagePath = entry.imagePath;
    if (!imagePath) {
      return { base64: undefined, mimeType: undefined };
    }
    try {
      const bytes = readFileSync(imagePath);
      return {
        base64: bytes.toString('base64'),
        mimeType: inferMimeType(imagePath),
      };
    } catch (err) {
      this.logger.warn(
        `failed to read image at ${imagePath}: ${(err as Error).message}`,
      );
      return { base64: undefined, mimeType: undefined };
    }
  }
}

/**
 * Substitute the three template placeholders in `templatePromptText`
 * using values from the queue entry. Done in one `.replace()` pass
 * (with a regex + function callback) so the resulting string stays
 * O(N) in the template length rather than O(N×M) for chained
 * `.replace()` calls. An entry with `rawTitle = null` substitutes the
 * placeholder with an empty string (the template author can fall
 * back to a literal placeholder inside the template if they want a
 * sentinel — we don't impose one here).
 */
export const renderPrompt = (
  templatePromptText: string,
  entry: PublisherQueueEntry,
): string => {
  const hasImage = entry.imagePath ? 'sí' : 'no';
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

/**
 * Best-effort MIME inference from a file extension. The crypto-news
 * media downloader persists photos with one of the four common
 * extensions below; anything else falls back to `image/jpeg`.
 */
function inferMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}
