import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EmbeddingPort } from '../../application/ports/embedding.port';

/**
 * Deterministic mock embeddings (live default until the OpenAI key lands).
 *
 * 64-dim unit vector from a sha256-seeded PRNG: stable per text, cheap,
 * no I/O. Good enough for the semantic stage in dev/test; staging picks
 * the OpenAI adapter via the module factory when `OPENAI_API_KEY` is set.
 */
@Injectable()
export class MockEmbeddingAdapter extends EmbeddingPort {
  private readonly dimensions = 64;

  public isAvailable(): boolean {
    return true;
  }

  public async embed(text: string): Promise<ReadonlyArray<number> | null> {
    const seed = createHash('sha256').update(text).digest();
    const vector: number[] = [];
    let state = seed.readUInt32BE(0);
    for (let i = 0; i < this.dimensions; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      vector.push(state / 0xffffffff - 0.5);
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) {
      return null;
    }
    return vector.map((v) => v / norm);
  }
}
