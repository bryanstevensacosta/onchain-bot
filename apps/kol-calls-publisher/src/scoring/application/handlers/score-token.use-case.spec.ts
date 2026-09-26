import { ScoreTokenUseCase } from './score-token.use-case';
import { evaluateScoreGates } from './score-gates';
import { InMemoryScoredCallRepository } from '../../infrastructure/repositories/in-memory-scored-call.repository';

const EVM_ADDR = '0x1234567890abcdef1234567890abcdef12345678';
const SOL_ADDR = 'So11111111111111111111111111111111111111112';

function makeUseCase(): ScoreTokenUseCase {
  return new ScoreTokenUseCase(new InMemoryScoredCallRepository());
}

function baseInput(overrides = {}): Parameters<ScoreTokenUseCase['execute']>[0]['mentions'][number] {
  return {
    mentionId: 'evm:0xabc:ch1:1:0',
    kolId: 'ch1',
    messageId: 1,
    contractIndex: 0,
    chain: 'evm',
    address: EVM_ADDR,
    ...overrides,
  };
}

describe('ScoreTokenUseCase (failing-first, todo 9)', () => {
  it('scores a bare mention at base 50 / NEUTRAL with no market data', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      mentions: [
        baseInput({
          securityFlag: 'LEGITIMATE',
          config: {
            minScore: 0,
            maxRiskWeight: 999,
            minCompleteness: 0,
            blockedClassifications: [],
            enableBlacklist: false,
            blacklistedAddresses: [],
            honeypotScoreBelow: 0,
            honeypotRiskAbove: 999,
            publishableChains: ['evm', 'solana', 'unknown'],
          },
        }),
      ],
    });
    expect(result.discarded).toBe(0);
    expect(result.scored).toHaveLength(1);
    expect(result.scored[0].score).toBe(50);
    expect(result.scored[0].tier).toBe('NEUTRAL');
    expect(result.events).toHaveLength(1);
  });

  it('adds market bonuses (high liquidity +20, high holders +15)', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      mentions: [
        baseInput({
          liquidityUsd: 50_000,
          holders: 600,
          securityFlag: 'LEGITIMATE',
          config: {
            minScore: 0,
            maxRiskWeight: 999,
            minCompleteness: 0,
            blockedClassifications: [],
            enableBlacklist: false,
            blacklistedAddresses: [],
            honeypotScoreBelow: 0,
            honeypotRiskAbove: 999,
            publishableChains: ['evm', 'solana', 'unknown'],
          },
        }),
      ],
    });
    expect(result.scored[0].score).toBe(85);
    expect(result.scored[0].tier).toBe('STRONG');
  });

  it('applies CRITICAL signal penalty (-15)', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      mentions: [
        baseInput({
          securityFlag: 'LEGITIMATE',
          signals: [{ type: 'RUG', severity: 'CRITICAL', description: 'rug' }],
          config: {
            minScore: 0,
            maxRiskWeight: 999,
            minCompleteness: 0,
            blockedClassifications: [],
            enableBlacklist: false,
            blacklistedAddresses: [],
            honeypotScoreBelow: 0,
            honeypotRiskAbove: 999,
            publishableChains: ['evm', 'solana', 'unknown'],
          },
        }),
      ],
    });
    expect(result.scored[0].score).toBe(35);
  });

  it('multiplies by reputation (avg 1.0 -> x1.15)', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      mentions: [
        baseInput({
          securityFlag: 'LEGITIMATE',
          avgKolReputation: 1,
          config: {
            minScore: 0,
            maxRiskWeight: 999,
            minCompleteness: 0,
            blockedClassifications: [],
            enableBlacklist: false,
            blacklistedAddresses: [],
            honeypotScoreBelow: 0,
            honeypotRiskAbove: 999,
            publishableChains: ['evm', 'solana', 'unknown'],
          },
        }),
      ],
    });
    expect(result.scored[0].score).toBe(57);
  });

  it('caps SCAM at 5', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      mentions: [
        baseInput({
          liquidityUsd: 50_000,
          holders: 600,
          securityFlag: 'SCAM',
          config: {
            minScore: 0,
            maxRiskWeight: 999,
            minCompleteness: 0,
            blockedClassifications: [],
            enableBlacklist: false,
            blacklistedAddresses: [],
            honeypotScoreBelow: 0,
            honeypotRiskAbove: 999,
            publishableChains: ['evm', 'solana', 'unknown'],
          },
        }),
      ],
    });
    expect(result.scored[0].score).toBe(5);
    expect(result.scored[0].tier).toBe('AVOID');
  });

  it('discards below-cut mentions pre-publisher (adversarial: no market data -> UNKNOWN cap 20 < 50)', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({ mentions: [baseInput()] });
    expect(result.scored).toHaveLength(0);
    expect(result.events).toHaveLength(0);
    expect(result.discarded).toBe(1);
  });

  it('returns empty output for empty input, never throws', async () => {
    const uc = makeUseCase();
    await expect(uc.execute({ mentions: [] })).resolves.toEqual({
      scored: [],
      events: [],
      discarded: 0,
    });
  });

  it('accepts solana addresses without lowercasing', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      mentions: [
        baseInput({
          mentionId: 'solana:abc:ch1:1:0',
          chain: 'solana',
          address: SOL_ADDR,
          securityFlag: 'LEGITIMATE',
          config: {
            minScore: 0,
            maxRiskWeight: 999,
            minCompleteness: 0,
            blockedClassifications: [],
            enableBlacklist: false,
            blacklistedAddresses: [],
            honeypotScoreBelow: 0,
            honeypotRiskAbove: 999,
            publishableChains: ['evm', 'solana', 'unknown'],
          },
        }),
      ],
    });
    expect(result.scored).toHaveLength(1);
    expect(result.scored[0].address).toBe(SOL_ADDR);
  });
});

describe('evaluateScoreGates (8 fail-fast gates)', () => {
  const openConfig = {
    minScore: 0,
    maxRiskWeight: 999,
    minCompleteness: 0,
    blockedClassifications: [] as string[],
    enableBlacklist: false,
    blacklistedAddresses: [] as string[],
    honeypotScoreBelow: 0,
    honeypotRiskAbove: 999,
    publishableChains: ['evm', 'solana', 'unknown'],
  };

  function gateArgs(overrides = {}): Parameters<typeof evaluateScoreGates>[0] {
    return {
      chain: 'evm',
      address: EVM_ADDR,
      score: 80,
      classification: 'UNKNOWN',
      riskWeight: 0,
      snapshotCompleteness: 1,
      config: openConfig,
      ...overrides,
    };
  }

  it('gate 0 INVALID_ADDRESS rejects malformed addresses', () => {
    const reasons = evaluateScoreGates(gateArgs({ address: 'not-an-address' }));
    expect(reasons.map((r) => r.code)).toContain('INVALID_ADDRESS');
  });

  it('gate 1 SCORE_TOO_LOW rejects below minScore', () => {
    const reasons = evaluateScoreGates(
      gateArgs({ score: 10, config: { ...openConfig, minScore: 50 } }),
    );
    expect(reasons.map((r) => r.code)).toContain('SCORE_TOO_LOW');
  });

  it('gate 2 CLASSIFICATION_BLOCKED rejects blocked labels', () => {
    const reasons = evaluateScoreGates(
      gateArgs({
        classification: 'SCAM',
        config: { ...openConfig, blockedClassifications: ['SCAM'] },
      }),
    );
    expect(reasons.map((r) => r.code)).toContain('CLASSIFICATION_BLOCKED');
  });

  it('gate 3 BLACKLISTED rejects listed addresses when enabled', () => {
    const reasons = evaluateScoreGates(
      gateArgs({
        config: {
          ...openConfig,
          enableBlacklist: true,
          blacklistedAddresses: [`evm:${EVM_ADDR.toLowerCase()}`],
        },
      }),
    );
    expect(reasons.map((r) => r.code)).toContain('BLACKLISTED');
  });

  it('gate 4 HONEYPOT_SUSPECTED flags low score + high group risk', () => {
    const reasons = evaluateScoreGates(
      gateArgs({
        score: 5,
        riskWeight: 95,
        config: {
          ...openConfig,
          honeypotScoreBelow: 10,
          honeypotRiskAbove: 80,
        },
      }),
    );
    expect(reasons.map((r) => r.code)).toContain('HONEYPOT_SUSPECTED');
  });

  it('gate 5 RISK_WEIGHT_EXCEEDED rejects over-budget group risk', () => {
    const reasons = evaluateScoreGates(
      gateArgs({
        riskWeight: 95,
        config: { ...openConfig, maxRiskWeight: 50 },
      }),
    );
    expect(reasons.map((r) => r.code)).toContain('RISK_WEIGHT_EXCEEDED');
  });

  it('gate 6 INSUFFICIENT_DATA rejects thin snapshots', () => {
    const reasons = evaluateScoreGates(
      gateArgs({
        snapshotCompleteness: 0,
        config: { ...openConfig, minCompleteness: 0.5 },
      }),
    );
    expect(reasons.map((r) => r.code)).toContain('INSUFFICIENT_DATA');
  });

  it('gate 7 CHAIN_UNSUPPORTED rejects chains outside the publishable set', () => {
    const reasons = evaluateScoreGates(
      gateArgs({
        chain: 'unknown',
        config: { ...openConfig, publishableChains: ['evm', 'solana'] },
      }),
    );
    expect(reasons.map((r) => r.code)).toContain('CHAIN_UNSUPPORTED');
  });

  it('zero reasons for a clean high-score mention', () => {
    expect(evaluateScoreGates(gateArgs())).toHaveLength(0);
  });
});
