import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmbeddingPort,
  type EmbeddingProviderName,
} from '@/embeddings/domain/ports/embedding.port';

/**
 * Local embeddings (backend `Xenova/all-MiniLM-L6-v2` shape, read-only
 * mirror — never imported). Lazy `@xenova/transformers` load with the
 * same 30s boot timeout; the dep is OPTIONAL here (not in
 * package.json, so no lockfile churn): a missing dep is an explicit
 * 503, never a hang. Unavailable → LOUD, matching the OpenAI adapter.
 */
@Injectable()
export class LocalEmbeddingAdapter extends EmbeddingPort {
  private readonly logger = new Logger(LocalEmbeddingAdapter.name);
  private readonly localModel: string;
  private model: {
    (
      text: string,
      opts: { pooling: string; normalize: boolean },
    ): Promise<{ data: ArrayLike<number> }>;
  } | null = null;
  private isLoaded = false;
  private loadError: Error | null = null;

  public constructor(private readonly config: ConfigService) {
    super();
    this.localModel =
      (config.get<string>('EMBEDDING_LOCAL_MODEL', '') ?? '').trim() ||
      (config.get<string>('DEDUP_EMBEDDING_MODEL', '') ?? '').trim() ||
      'Xenova/all-MiniLM-L6-v2';
  }

  public get providerName(): EmbeddingProviderName {
    return 'local';
  }

  public get modelName(): string {
    return this.localModel;
  }

  public async isAvailable(): Promise<boolean> {
    return this.isLoaded && this.model !== null;
  }

  public async embed(text: string): Promise<ReadonlyArray<number>> {
    await this.ensureModel();
    if (this.model === null) {
      throw new ServiceUnavailableException(
        'Local embedding model is null after ensureModel()',
      );
    }
    try {
      const result = await this.model(text, {
        pooling: 'mean',
        normalize: true,
      });
      const embedding: Array<number> = [];
      const data = result.data;
      for (let i = 0; i < data.length; i++) {
        embedding.push(data[i] as number);
      }
      if (embedding.length === 0) {
        throw new Error('empty embedding vector');
      }
      return embedding;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Local embedding request failed (loud): ${message}`);
      throw new ServiceUnavailableException(
        `Local embedding request failed: ${message}`,
      );
    }
  }

  private async ensureModel(): Promise<void> {
    if (this.isLoaded && this.model !== null) {
      return;
    }
    if (this.loadError !== null) {
      throw new ServiceUnavailableException(
        `Local embedding model not available: ${this.loadError.message}`,
      );
    }
    try {
      const { pipeline, env } =
        await LocalEmbeddingAdapter.importTransformers();
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      env.cacheDir = '.cache/transformers';
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
      const loader = pipeline as (
        task: string,
        model: string,
      ) => Promise<LocalEmbeddingAdapter['model']>;
      this.model = await Promise.race([
        loader('feature-extraction', this.localModel),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Model loading timeout (30s)')),
            30000,
          ),
        ),
      ]);
      this.isLoaded = true;
      this.logger.log(`Local embedding model loaded: ${this.localModel}`);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(
        `Local embedding model failed to load (loud): ${wrapped.message}`,
      );
      this.loadError = wrapped;
      this.isLoaded = false;
      throw new ServiceUnavailableException(
        `Local embedding model not available: ${wrapped.message} ` +
          `(@xenova/transformers is optional; install it or use OPENAI_API_KEY / USE_MOCK_AI=true)`,
      );
    }
  }

  private static async importTransformers(): Promise<{
    pipeline: unknown;
    env: {
      allowLocalModels: boolean;
      useBrowserCache: boolean;
      cacheDir: string;
      backends?: { onnx?: { wasm?: { numThreads: number } } };
    };
  }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const mod = await Function('return import("@xenova/transformers")')();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return { pipeline: mod.pipeline, env: mod.env };
    } catch (err) {
      throw new Error(
        `@xenova/transformers is not installed (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }
}
