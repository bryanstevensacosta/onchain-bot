import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EmbeddingPort,
  type EmbeddingProviderName,
} from '@/embeddings/domain/ports/embedding.port';

/**
 * Mock embeddings (USE_MOCK_AI=true): deterministic 64-dim unit vector
 * from a sha256-seeded PRNG — stable per text, zero I/O. Same shape
 * as the feed-publisher migration source; good enough for the
 * semantic stage in dev/test. Always available.
 */
@Injectable()
export class MockEmbeddingAdapter extends EmbeddingPort {
  private readonly dimensions = 64;

  public get providerName(): EmbeddingProviderName {
    return 'mock';
  }

  public get modelName(): string {
    return 'mock-deterministic-64';
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async embed(text: string): Promise<ReadonlyArray<number>> {
    const seed = createHash('sha256').update(text).digest();
    const vector: Array<number> = [];
    let state = seed.readUInt32BE(0);
    for (let i = 0; i < this.dimensions; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      vector.push(state / 0xffffffff - 0.5);
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) {
      throw new Error('MockEmbeddingAdapter: zero-norm vector (unreachable)');
    }
    return vector.map((v) => v / norm);
  }
}
