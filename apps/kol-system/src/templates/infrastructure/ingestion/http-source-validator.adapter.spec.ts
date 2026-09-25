import { ConfigService } from '@nestjs/config';
import { HttpSourceValidatorAdapter } from './http-source-validator.adapter';

describe('HttpSourceValidatorAdapter (P16, failing-first)', () => {
  const config = {
    get: () => 'http://localhost:3031',
  } as unknown as ConfigService;
  const adapter = new HttpSourceValidatorAdapter(config);
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('splits known vs unknown channel ids against the feed', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => [{ channelId: 'ch1' }, { channelId: 'ch2' }],
    })) as never;
    const result = await adapter.validateSources(['ch1', 'ghost']);
    expect(result.valid).toEqual(['ch1']);
    expect(result.unknownIds).toEqual(['ghost']);
  });

  it('fails open when the feed is unreachable (accept all, pipeline continues)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as never;
    const result = await adapter.validateSources(['ch1']);
    expect(result.valid).toEqual(['ch1']);
    expect(result.unknownIds).toEqual([]);
  });
});
