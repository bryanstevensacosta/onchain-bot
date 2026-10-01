import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingPort } from '@/deduplication/application/ports/embedding.port';
import {
  aiMlPost,
  resolveAiMlHttpOptions,
  type AiMlHttpOptions,
} from './ai-ml-http';

/**
 * Remote embeddings leg over ai-ml (ai-ml plan todo 3).
 *
 * Speaks `POST /api/embeddings/embed`. `isAvailable()` is a sync
 * config check (explicitly blanked `AI_ML_URL` disables the leg) —
 * liveness surfaces as a LOUD throw on `embed` (mirrors the ai-ml
 * 503 contract, never null). The dual adapter catches that as
 * `skipped`; the `ai-ml` serving mode lets it propagate so outages
 * stay visible at cutover rehearsal.
 */
@Injectable()
export class AiMlEmbeddingClientAdapter extends EmbeddingPort {
  private readonly options: AiMlHttpOptions;
  private readonly disabled: boolean;

  public constructor(config: ConfigService) {
    super();
    this.options = resolveAiMlHttpOptions((key: string, fallback?: unknown) =>
      config?.get(key, fallback),
    );
    const raw = config?.get<string>('AI_ML_URL');
    this.disabled = typeof raw === 'string' ? raw.trim().length === 0 : false;
  }

  public isAvailable(): boolean {
    return !this.disabled;
  }

  public async embed(text: string): Promise<ReadonlyArray<number> | null> {
    const result = await aiMlPost<{ vector: ReadonlyArray<number> }>(
      this.options,
      '/api/embeddings/embed',
      { text },
    );
    return [...result.vector];
  }
}
