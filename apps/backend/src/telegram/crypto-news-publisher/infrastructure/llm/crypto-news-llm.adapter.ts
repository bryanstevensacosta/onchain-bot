import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { LlmPort } from 'shared/llm';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import {
  loadCryptoNewsPublisherConfig,
  type CryptoNewsPublisherConfig,
} from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';

/**
 * Crypto-news-specific wrapper around the shared `LlmPort`.
 *
 * Responsibilities (vs the generic LlmPort):
 *  - Load the prompt template from the on-disk config
 *    (`config/crypto-news-publisher.config.json`).
 *  - Substitute `{{title}}`, `{{original}}`, `{{hasImage}}` from the
 *    queue entry.
 *  - If the entry has a local `imagePath`, read the bytes, base64-
 *    encode them, and pass them to the underlying LlmPort so the
 *    model can use the image as multimodal context. The file is
 *    already on disk (downloaded at ingest time by the crypto-news
 *    listener) — Telegram CDN URLs are NOT used here (they expire
 *    after ~1h; the queue may not be drained for hours).
 *  - Extract the textual response from the LlmPort output. The base
 *    `LlmPort.generateText` contract already returns a string, so
 *    this is a thin pass-through.
 */
@Injectable()
export class CryptoNewsLlmAdapter {
  private readonly logger = new Logger(CryptoNewsLlmAdapter.name);
  private readonly config: CryptoNewsPublisherConfig;

  public constructor(private readonly llmPort: LlmPort) {
    this.config = loadCryptoNewsPublisherConfig();
  }

  /**
   * Generate a refined Spanish-language post for the given queue
   * entry. Returns the LLM-generated text (caption). Throws whatever
   * the underlying `LlmPort` throws — the caller (the cron publisher)
   * is responsible for translating LLM failures into queue state
   * transitions (increment attempts / mark failed).
   */
  public async generateForEntry(entry: PublisherQueueEntry): Promise<string> {
    const prompt = this.buildPrompt(entry);
    const imagePayload = this.readImagePayload(entry);
    return this.llmPort.generateText({
      prompt,
      imageUrl: undefined,
      imageBase64: imagePayload.base64,
      mimeType: imagePayload.mimeType,
      maxTokens: 2000,
      temperature: 0.7,
    });
  }

  /**
   * Build the prompt string by substituting placeholders in the
   * configured template. Exposed for testing.
   */
  public buildPrompt(entry: PublisherQueueEntry): string {
    const template = this.config.prompt.template;
    const hasImage = entry.imagePath ? 'sí' : 'no';
    return template
      .replace('{{title}}', entry.rawTitle ?? '(sin título)')
      .replace('{{original}}', entry.rawContent)
      .replace('{{hasImage}}', hasImage);
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
