import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);

  private model: any = null;
  private isLoaded = false;
  private loadError: Error | null = null;

  private readonly MODEL_PATH =
    process.env.DEDUP_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';

  async onModuleInit(): Promise<void> {
    // Skip model loading in staging to avoid hanging during bootstrap
    if (process.env.NODE_ENV === 'staging') {
      this.logger.log('Skipping embedding model load in staging');
      return;
    }

    try {
      await this.ensureModel();
    } catch (error) {
      this.logger.warn(
        `Embedding model failed to load: ${error instanceof Error ? error.message : String(error)}. ` +
          'Semantic deduplication will be skipped gracefully.',
      );
      this.loadError =
        error instanceof Error ? error : new Error(String(error));
      this.isLoaded = false;
    }
  }

  async ensureModel(): Promise<void> {
    if (this.isLoaded && this.model) {
      return;
    }

    if (this.loadError) {
      throw this.loadError;
    }

    this.logger.log(`Loading embedding model: ${this.MODEL_PATH}`);

    try {
      const { pipeline, env } = await import('@xenova/transformers');

      env.allowLocalModels = false;
      env.useBrowserCache = false;
      env.cacheDir = '.cache/transformers';

      env.backends.onnx.wasm.numThreads = 1;

      this.model = await pipeline('feature-extraction', this.MODEL_PATH);

      this.isLoaded = true;
      this.logger.log('Embedding model loaded successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to load embedding model: ${err.message}`,
        err.stack,
      );
      this.loadError = err;
      this.isLoaded = false;
      throw err;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      if (this.loadError) {
        throw new Error(
          `Embedding model not available: ${this.loadError.message}`,
        );
      }
      throw new Error(
        'Embedding model not loaded. Call ensureModel() first or check isAvailable().',
      );
    }

    await this.ensureModel();

    if (!this.model) {
      throw new Error('Embedding model is null after ensureModel()');
    }

    try {
      interface TransformersResult {
        data: ArrayLike<number>;
      }

      // @xenova/transformers - external library returns untyped pipeline
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const result = (await this.model(text, {
        pooling: 'mean',
        normalize: true,
      })) as TransformersResult;

      const embedding: number[] = [];
      const data = result.data;
      const length = data.length;
      for (let i = 0; i < length; i++) {
        embedding.push(data[i]);
      }

      return embedding;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to generate embedding: ${err.message}`);
      throw err;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  isAvailable(): boolean {
    return this.isLoaded && this.model !== null;
  }

  getLoadError(): Error | null {
    return this.loadError;
  }
}
