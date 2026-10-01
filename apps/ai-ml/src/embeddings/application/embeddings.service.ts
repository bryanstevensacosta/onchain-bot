import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingCache } from '../domain/embedding-cache';
import type { EmbeddingPort } from '../domain/ports/embedding.port';
import { MockEmbeddingAdapter } from '../infrastructure/embeddings/mock-embedding.adapter';
import { OpenAiEmbeddingAdapter } from '../infrastructure/embeddings/openai-embedding.adapter';
import { LocalEmbeddingAdapter } from '../infrastructure/embeddings/local-embedding.adapter';

export interface EmbeddingModelsView {
  readonly providers: ReadonlyArray<{
    provider: string;
    model: string;
    available: boolean;
  }>;
  readonly defaultModel: string;
  readonly cache: {
    size: number;
    maxEntries: number;
    hits: number;
    misses: number;
  };
}

/**
 * EmbeddingsService (ai-ml, todo 2): THE single embeddings interface.
 *
 * Model-per-call routing: `text-embedding-*` → OpenAI,
 * `*MiniLM*`/`xenova*` → local, `mock*` → mock; no model → factory
 * default (mock when USE_MOCK_AI=true, else first available
 * openai → local). Results cached per (effective model, text).
 * Provider outages throw LOUD (503, explicit hint) — never null.
 */
@Injectable()
export class EmbeddingsService {
  public static readonly MAX_BATCH = 100;

  public constructor(
    private readonly config: ConfigService,
    private readonly mock: MockEmbeddingAdapter,
    private readonly openai: OpenAiEmbeddingAdapter,
    private readonly local: LocalEmbeddingAdapter,
    private readonly cache: EmbeddingCache,
  ) {}

  public async embed(
    text: string,
    model?: string,
  ): Promise<ReadonlyArray<number>> {
    const clean = (text ?? '').trim();
    if (clean.length === 0) {
      throw new BadRequestException('text must be a non-empty string');
    }
    const adapter = await this.resolveAdapter(model);
    const cached = this.cache.get(adapter.modelName, clean);
    if (cached !== undefined) {
      return cached;
    }
    const vector = await adapter.embed(clean, model);
    this.cache.set(adapter.modelName, clean, vector);
    return vector;
  }

  public async embedBatch(
    texts: ReadonlyArray<string>,
    model?: string,
  ): Promise<ReadonlyArray<ReadonlyArray<number>>> {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new BadRequestException('texts must be a non-empty array');
    }
    if (texts.length > EmbeddingsService.MAX_BATCH) {
      throw new BadRequestException(
        `texts exceeds max batch ${EmbeddingsService.MAX_BATCH} (got ${texts.length})`,
      );
    }
    const out: Array<ReadonlyArray<number>> = [];
    for (const text of texts) {
      out.push(await this.embed(text, model));
    }
    return out;
  }

  public async listModels(): Promise<EmbeddingModelsView> {
    const adapters: ReadonlyArray<EmbeddingPort> = [
      this.mock,
      this.openai,
      this.local,
    ];
    const providers = [];
    for (const adapter of adapters) {
      providers.push({
        provider: adapter.providerName,
        model: adapter.modelName,
        available: await adapter.isAvailable(),
      });
    }
    return {
      providers,
      defaultModel: (await this.resolveAdapter(undefined)).modelName,
      cache: this.cache.stats(),
    };
  }

  private async resolveAdapter(model?: string): Promise<EmbeddingPort> {
    const pinned = (model ?? '').trim();
    if (pinned !== '') {
      const routed = this.routePinned(pinned);
      if (routed === null) {
        throw new BadRequestException(
          `Unknown embedding model '${pinned}' (expected text-embedding-* | *MiniLM*/xenova* | mock-*)`,
        );
      }
      if (!(await routed.isAvailable())) {
        throw new ServiceUnavailableException(
          `Embedding model '${pinned}' unavailable (provider=${routed.providerName}; ` +
            `mock: USE_MOCK_AI=true, openai: OPENAI_API_KEY + USE_MOCK_AI=false, ` +
            `local: install @xenova/transformers)`,
        );
      }
      return routed;
    }
    if ((this.config.get<string>('USE_MOCK_AI', 'true') ?? 'true') === 'true') {
      return this.mock;
    }
    if (await this.openai.isAvailable()) {
      return this.openai;
    }
    if (await this.local.isAvailable()) {
      return this.local;
    }
    throw new ServiceUnavailableException(
      'No embedding provider available (set USE_MOCK_AI=true or configure OPENAI_API_KEY / @xenova/transformers)',
    );
  }

  private routePinned(pinned: string): EmbeddingPort | null {
    const lower = pinned.toLowerCase();
    if (lower.startsWith('text-embedding')) {
      return this.openai;
    }
    if (
      lower.includes('minilm') ||
      lower.includes('xenova') ||
      lower.startsWith('local')
    ) {
      return this.local;
    }
    if (lower.startsWith('mock')) {
      return this.mock;
    }
    return null;
  }
}
