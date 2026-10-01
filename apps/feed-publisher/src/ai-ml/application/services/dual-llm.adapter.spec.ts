import { LlmPort } from '@/llm/application/ports/llm.port';
import { AiMlParityService } from './ai-ml-parity.service';
import { DualLlmAdapter } from './dual-llm.adapter';

class StubLocal extends LlmPort {
  public calls = 0;
  public constructor(private readonly text: string | null) {
    super();
  }
  public async generateText(request: { prompt: string }): Promise<string> {
    this.calls += 1;
    void request;
    if (this.text === null) {
      throw new Error('local gateway down');
    }
    return this.text;
  }
  public async isAvailable(): Promise<boolean> {
    return this.text !== null;
  }
}

class StubRemote extends LlmPort {
  public calls = 0;
  public constructor(private readonly text: string | null) {
    super();
  }
  public async generateText(request: { prompt: string }): Promise<string> {
    this.calls += 1;
    void request;
    if (this.text === null) {
      throw new Error('ai-ml unreachable');
    }
    return this.text;
  }
  public async isAvailable(): Promise<boolean> {
    return this.text !== null;
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
      process.env[key] = vars[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
};

describe('DualLlmAdapter', () => {
  it('local mode serves local only (remote untouched, nothing recorded)', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'local' }, async () => {
      const local = new StubLocal('local-text');
      const remote = new StubRemote('remote-text');
      const parity = new AiMlParityService();
      const dual = new DualLlmAdapter(local, remote, parity);
      await expect(dual.generateText({ prompt: 'hello' })).resolves.toBe(
        'local-text',
      );
      expect(remote.calls).toBe(0);
      expect(parity.summary().compared).toBe(0);
    });
  });

  it('dual mode returns local and records matched on identical mock output', async () => {
    await withEnv(
      { FEED_AI_ML_MODE: 'dual', USE_MOCK_AI: 'true' },
      async () => {
        const text = '[LLM MOCK] Generated text for: hello';
        const dual = new DualLlmAdapter(
          new StubLocal(text),
          new StubRemote(text),
          new AiMlParityService(),
        );
        await expect(dual.generateText({ prompt: 'hello' })).resolves.toBe(
          text,
        );
      },
    );
  });

  it('dual mode never breaks serving when ai-ml is down (skipped, local wins)', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'dual' }, async () => {
      const local = new StubLocal('local-text');
      const remote = new StubRemote(null);
      const parity = new AiMlParityService();
      const dual = new DualLlmAdapter(local, remote, parity);
      await expect(dual.generateText({ prompt: 'hello' })).resolves.toBe(
        'local-text',
      );
      expect(parity.summary().llm.skipped).toBe(1);
      expect(() => parity.assertNoDivergence()).not.toThrow();
    });
  });

  it('dual mode records divergence when the remote leg disagrees (no cutover)', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'dual' }, async () => {
      const parity = new AiMlParityService();
      const dual = new DualLlmAdapter(
        new StubLocal('local-text'),
        new StubRemote(''),
        parity,
      );
      await expect(dual.generateText({ prompt: 'hello' })).resolves.toBe(
        'local-text',
      );
      expect(parity.summary().diverged).toBe(1);
      expect(() => parity.assertNoDivergence()).toThrow(
        'ai-ml dual-run diverged',
      );
    });
  });

  it('ai-ml mode serves remote only and fails closed when ai-ml is down', async () => {
    await withEnv({ FEED_AI_ML_MODE: 'ai-ml' }, async () => {
      const local = new StubLocal('local-text');
      const ok = new DualLlmAdapter(
        local,
        new StubRemote('remote-text'),
        new AiMlParityService(),
      );
      await expect(ok.generateText({ prompt: 'hello' })).resolves.toBe(
        'remote-text',
      );
      expect(local.calls).toBe(0);
      const down = new DualLlmAdapter(
        local,
        new StubRemote(null),
        new AiMlParityService(),
      );
      await expect(down.generateText({ prompt: 'hello' })).rejects.toThrow(
        'ai-ml unreachable',
      );
    });
  });
});
