import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingPort } from '../../application/ports/embedding.port';

/**
 * OpenAI embeddings (`text-embedding-3-small`).
 *
 * Selected by the module factory only when `OPENAI_API_KEY` is set and
 * `USE_MOCK_AI` is not 'true'. Every failure resolves null (fail-open) —
 * the cascade degrades to exact+content stages instead of blocking.
 */
@Injectable()
export class OpenAiEmbeddingAdapter extends EmbeddingPort {
  private readonly logger = new Logger(OpenAiEmbeddingAdapter.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  public constructor(private readonly config: ConfigService) {
    super();
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const mockMode = this.config.get<string>('USE_MOCK_AI', 'true') === 'true';
    this.model = this.config.get<string>(
      'DEDUP_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
    this.client =
      apiKey !== undefined && apiKey !== '' && !mockMode
        ? new OpenAI({ apiKey })
        : null;
  }

  public isAvailable(): boolean {
    return this.client !== null;
  }

  public async embed(text: string): Promise<ReadonlyArray<number> | null> {
    if (this.client === null) {
      return null;
    }
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text.slice(0, 8000),
      });
      const vector = response.data[0]?.embedding;
      return vector && vector.length > 0 ? [...vector] : null;
    } catch (err) {
      this.logger.warn(
        `Embedding request failed (fail-open): ${(err as Error).message}`,
      );
      return null;
    }
  }
}
