import { EmbeddingPort } from '@/deduplication/application/ports/embedding.port';
import { AiMlParityService } from './ai-ml-parity.service';
import { DualEmbeddingAdapter } from './dual-embedding.adapter';

class StubLocal extends EmbeddingPort {
  public calls = 0;
  public constructor(private readonly vector: ReadonlyArray<number> | null) {
    super();
  }
  public isAvailable(): boolean {
    return this.vector !== null;
  }
  public async embed(text: string): Promise<ReadonlyArray<number> | null> {
    this.calls += 1;
    void text;
    return this.vector;
  }
}

class StubRemote extends EmbeddingPort {
  public calls = 0;
  public constructor(
    private readonly vector: ReadonlyArray<number> | null,
    private readonly down = false,
  ) {
    super();
  }
  public isAvailable(): boolean {
    return !this.down;
  }
  public async embed(text: string): Promise<ReadonlyArray<number> | null> {
    this.calls += 1;
    void text;
    if (this.down) {
      throw new Error('ai-ml embeddings unreachable (503)');
    }
    return this.vector;
  }
}

const withEnv = async (
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> => {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key] as string;
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key] as string;
      }
    }
  }
};

describe('DualEmbeddingAdapter', () => {
  it('local mode serves local only (remote untouched)', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'local' }, async () => {
      const local = new StubLocal([1, 0]);
      const remote = new StubRemote([1, 0]);
      const dual = new DualEmbeddingAdapter(
        local,
        remote,
        new AiMlParityService(),
      );
      await expect(dual.embed('hello')).resolves.toEqual([1, 0]);
      expect(remote.calls).toBe(0);
    });
  });

  it('dual mode returns local on identical vectors (matched)', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'dual' }, async () => {
      const parity = new AiMlParityService();
      const dual = new DualEmbeddingAdapter(
        new StubLocal([1, 0]),
        new StubRemote([1, 0]),
        parity,
      );
      await expect(dual.embed('hello')).resolves.toEqual([1, 0]);
      expect(parity.summary().embeddings.matched).toBe(1);
    });
  });

  it('dual mode never blocks dedup when ai-ml is down (skipped, local wins)', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'dual' }, async () => {
      const parity = new AiMlParityService();
      const dual = new DualEmbeddingAdapter(
        new StubLocal([1, 0]),
        new StubRemote(null, true),
        parity,
      );
      await expect(dual.embed('hello')).resolves.toEqual([1, 0]);
      expect(parity.summary().embeddings.skipped).toBe(1);
      expect(() => parity.assertNoDivergence()).not.toThrow();
    });
  });

  it('dual mode records divergence on vector disagreement (no cutover)', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'dual' }, async () => {
      const parity = new AiMlParityService();
      const dual = new DualEmbeddingAdapter(
        new StubLocal([1, 0]),
        new StubRemote([0, 1]),
        parity,
      );
      await expect(dual.embed('hello')).resolves.toEqual([1, 0]);
      expect(parity.summary().diverged).toBe(1);
      expect(() => parity.assertNoDivergence()).toThrow(
        'ai-ml dual-run diverged',
      );
    });
  });

  it('ai-ml mode serves remote only and throws loud when ai-ml is down', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'ai-ml' }, async () => {
      const local = new StubLocal([1, 0]);
      const ok = new DualEmbeddingAdapter(
        local,
        new StubRemote([0, 1]),
        new AiMlParityService(),
      );
      await expect(ok.embed('hello')).resolves.toEqual([0, 1]);
      expect(local.calls).toBe(0);
      const down = new DualEmbeddingAdapter(
        local,
        new StubRemote(null, true),
        new AiMlParityService(),
      );
      await expect(down.embed('hello')).rejects.toThrow(
        'ai-ml embeddings unreachable',
      );
    });
  });
});
