import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmbeddingPort } from '../../../deduplication/application/ports/embedding.port';
import { resolveAiMlMode } from '../../ai-ml-mode';
import { AiMlEmbeddingClientAdapter } from '../../infrastructure/ai-ml-embedding-client.adapter';
import { AiMlParityService } from './ai-ml-parity.service';

/** DI token for the legacy in-process embeddings leg (mock | OpenAI). */
export const LOCAL_EMBEDDING_PORT = 'LOCAL_EMBEDDING_PORT';

/**
 * Dual-run embeddings port (ai-ml plan todo 3).
 *
 * Same mode contract as `DualLlmAdapter`: `local` serves the legacy
 * leg untouched; `dual` (default) runs both, records parity, returns
 * LOCAL (dedup never blocks on ai-ml — outages record `skipped`);
 * `ai-ml` serves the remote leg only and throws LOUD on outage
 * (mirrors the ai-ml 503 contract; the `DeduplicationService`
 * fail-open catch still degrades to not-a-duplicate downstream).
 */
@Injectable()
export class DualEmbeddingAdapter extends EmbeddingPort {
  private readonly logger = new Logger(DualEmbeddingAdapter.name);

  public constructor(
    @Inject(LOCAL_EMBEDDING_PORT)
    private readonly local: EmbeddingPort,
    @Inject(AiMlEmbeddingClientAdapter)
    private readonly remote: AiMlEmbeddingClientAdapter,
    @Inject(AiMlParityService) private readonly parity: AiMlParityService,
  ) {
    super();
  }

  public isAvailable(): boolean {
    if (resolveAiMlMode(process.env['FEED_AI_ML_MODE']) === 'ai-ml') {
      return Boolean(this.remote) && this.remote.isAvailable();
    }
    return Boolean(this.local) && this.local.isAvailable();
  }

  public async embed(text: string): Promise<ReadonlyArray<number> | null> {
    const mode = resolveAiMlMode(process.env['FEED_AI_ML_MODE']);
    if (mode === 'ai-ml') {
      if (!this.remote) {
        throw new Error(
          'FEED_AI_ML_MODE=ai-ml but the ai-ml embedding client is unwired',
        );
      }
      return this.remote.embed(text);
    }
    if (!this.local) {
      throw new Error('dual/local embedding mode without a local leg (wiring bug)');
    }
    const localVector = await this.local.embed(text);
    if (mode === 'local' || !this.remote || !this.parity) {
      return localVector;
    }
    let remoteVector: ReadonlyArray<number> | null = null;
    let remoteError: string | null = null;
    try {
      remoteVector = await this.remote.embed(text);
    } catch (err) {
      remoteError = err instanceof Error ? err.message : String(err);
    }
    if (remoteError !== null) {
      this.parity.recordEmbedding('skipped', remoteError.slice(0, 200));
      return localVector;
    }
    const outcome = this.parity.compareEmbeddings(localVector, remoteVector);
    if (outcome === 'diverged') {
      this.logger.warn(
        'ai-ml embedding divergence (local serves, cutover blocked): local=' +
          describeVector(localVector) +
          ', remote=' +
          describeVector(remoteVector),
      );
    }
    this.parity.recordEmbedding(outcome);
    return localVector;
  }
}

const describeVector = (vector: ReadonlyArray<number> | null): string => {
  if (vector === null) {
    return 'null';
  }
  return vector.length + '-dim';
};
