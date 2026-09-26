import { ScoreTokenUseCase } from './score-token.use-case';
import { DEFAULT_SCORING_CONFIG } from '../../domain/scoring-config';
import { InMemoryScoredCallRepository } from '../../infrastructure/repositories/in-memory-scored-call.repository';

const EVM_ADDR = '0x1234567890abcdef1234567890abcdef12345678';

function makeUseCase(): ScoreTokenUseCase {
  return new ScoreTokenUseCase(new InMemoryScoredCallRepository());
}

/** Rich mention: high liquidity + high holders, LEGITIMATE, evm. */
function richMention(
  mentionId: string,
  overrides = {},
): Parameters<ScoreTokenUseCase['execute']>[0]['mentions'][number] {
  return {
    mentionId,
    kolId: 'ch1',
    messageId: 1,
    contractIndex: 0,
    chain: 'evm',
    address: EVM_ADDR,
    liquidityUsd: 50_000,
    holders: 600,
    securityFlag: 'LEGITIMATE',
    ...overrides,
  };
}

const OPEN_GATES = { minScore: 0 };

describe('ScoreTokenUseCase per-template scoring_config (todo 22, P28, failing-first)', () => {
  it('same input with 2 different configs -> different scores', async () => {
    const strictHigh = await makeUseCase().execute({
      mentions: [
        richMention('evm:m1:ch1:1:0', {
          scoringConfig: { baseScore: 50, gates: OPEN_GATES },
        }),
      ],
    });
    const lenientLow = await makeUseCase().execute({
      mentions: [
        richMention('evm:m2:ch1:1:0', {
          scoringConfig: { baseScore: 10, gates: OPEN_GATES },
        }),
      ],
    });
    expect(strictHigh.scored).toHaveLength(1);
    expect(lenientLow.scored).toHaveLength(1);
    expect(strictHigh.scored[0].score).toBe(85);
    expect(lenientLow.scored[0].score).toBe(45);
    expect(lenientLow.scored[0].score).not.toBe(strictHigh.scored[0].score);
  });

  it('no config -> v1 defaults intact (base 50, tiers 80/60/40/20)', async () => {
    expect(DEFAULT_SCORING_CONFIG.baseScore).toBe(50);
    expect(DEFAULT_SCORING_CONFIG.tiers).toEqual({
      strong: 80,
      decent: 60,
      neutral: 40,
      risky: 20,
    });
    const result = await makeUseCase().execute({
      mentions: [richMention('evm:m3:ch1:1:0')],
    });
    expect(result.discarded).toBe(0);
    expect(result.scored).toHaveLength(1);
    expect(result.scored[0].score).toBe(85);
    expect(result.scored[0].tier).toBe('STRONG');
  });
});
