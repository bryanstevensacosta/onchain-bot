import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  EmbeddingPort,
  type EmbeddingProviderName,
} from '@/embeddings/domain/ports/embedding.port';

/**
 * OpenAI embeddings (`text-embedding-3-small` default, model-per-call
 * override). Bound only when an API key is set and mock mode is off;
 * every failure throws LOUD (503) — the consumer treats that as an
 * explicit outage, never as "different" (deliberate deviation from
 * the feed-publisher fail-open source).
 */
@Injectable()
export class OpenAiEmbeddingAdapter extends EmbeddingPort {
  private readonly logger = new Logger(OpenAiEmbeddingAdapter.name);
  private readonly client: OpenAI | null;
  private readonly defaultModel: string;

  public constructor(private readonly config: ConfigService) {
    super();
    const apiKey = (config.get<string>('OPENAI_API_KEY', '') ?? '').trim();
    const mockMode =
      (config.get<string>('USE_MOCK_AI', 'true') ?? 'true') === 'true';
    this.defaultModel =
      (config.get<string>('EMBEDDING_MODEL', '') ?? '').trim() ||
      (config.get<string>('DEDUP_EMBEDDING_MODEL', '') ?? '').trim() ||
      'text-embedding-3-small';
    this.client = apiKey !== '' && !mockMode ? new OpenAI({ apiKey }) : null;
  }

  public get providerName(): EmbeddingProviderName {
    return 'openai';
  }

  public get modelName(): string {
    return this.defaultModel;
  }

  public async isAvailable(): Promise<boolean> {
    return this.client !== null;
  }

  public async embed(
    text: string,
    model?: string,
  ): Promise<ReadonlyArray<number>> {
    if (this.client === null) {
      throw new ServiceUnavailableException(
        'OpenAI embeddings unavailable (set OPENAI_API_KEY and USE_MOCK_AI=false)',
      );
    }
    try {
      const response = await this.client.embeddings.create({
        model: (model ?? '').trim() || this.defaultModel,
        input: text.slice(0, 8000),
      });
      const vector = response.data[0]?.embedding;
      if (!vector || vector.length === 0) {
        throw new Error('empty embedding vector');
      }
      return [...vector];
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`OpenAI embedding request failed (loud): ${message}`);
      throw new ServiceUnavailableException(
        `OpenAI embedding request failed: ${message}`,
      );
    }
  }
}
