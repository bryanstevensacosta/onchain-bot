import { ExtractFromMessageUseCase } from './extract-from-message.use-case';
import { RegexExtractorAdapter } from '../../infrastructure/adapters/regex-extractor.adapter';
import { InMemoryExtractionCandidateRepository } from '../../infrastructure/repositories/in-memory-extraction-candidate.repository';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WSOL = 'So11111111111111111111111111111111111111112';

function buildUseCase(): {
  useCase: ExtractFromMessageUseCase;
  repo: InMemoryExtractionCandidateRepository;
} {
  const repo = new InMemoryExtractionCandidateRepository();
  const useCase = new ExtractFromMessageUseCase(
    new RegexExtractorAdapter(),
    repo,
  );
  return { useCase, repo };
}

describe('ExtractFromMessageUseCase (P5 contract x mention, P26 snapshot base)', () => {
  it('1 message x 3 mentions -> 3 rows + 3 snapshot bases (multi-tip does NOT collapse)', async () => {
    const { useCase, repo } = buildUseCase();
    const occurredAt = new Date('2026-09-24T12:00:00.000Z');
    const result = await useCase.execute({
      kolId: 'kol-1',
      messageId: 42,
      occurredAt,
      text: `ape ${USDC} and ${WETH} plus sol play ${WSOL} $PEPE https://dexscreener.com/solana/abc`,
      handle: '@alpha',
      channelUrl: 'https://t.me/alpha',
      channelId: '-100123',
      channelTitle: 'Alpha',
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.snapshotBases).toHaveLength(3);
    expect(await repo.count()).toBe(3);

    const ids = result.candidates.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    for (const candidate of result.candidates) {
      expect(candidate.kolId).toBe('kol-1');
      expect(candidate.messageId).toBe(42);
      expect(candidate.handle).toBe('@alpha');
      expect(candidate.channelUrl).toBe('https://t.me/alpha');
    }

    for (const base of result.snapshotBases) {
      expect(base.occurred_at_telegram).toEqual(occurredAt);
      expect(base.ingested_at_kol.getTime()).toBeGreaterThanOrEqual(
        occurredAt.getTime(),
      );
      expect(base.ingested_at_kol.getTime()).toBeLessThanOrEqual(Date.now());
      expect('enriched_at' in base).toBe(false);
    }
    const baseIds = result.snapshotBases.map((b) => b.mentionId).sort();
    expect(baseIds).toEqual([...ids].sort());
  });

  it('repeats are valid: same contract twice -> 2 rows', async () => {
    const { useCase } = buildUseCase();
    const result = await useCase.execute({
      kolId: 'kol-1',
      messageId: 7,
      occurredAt: new Date('2026-09-24T12:00:00.000Z'),
      text: `first ${USDC} then again ${USDC}`,
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).not.toBe(result.candidates[1].id);
    expect(result.candidates[0].contractAddress.value).toBe(
      result.candidates[1].contractAddress.value,
    );
  });

  it('text without contract -> 0 rows, no throw', async () => {
    const { useCase } = buildUseCase();
    const result = await useCase.execute({
      kolId: 'kol-1',
      messageId: 8,
      occurredAt: new Date('2026-09-24T12:00:00.000Z'),
      text: 'gm fam $BTC to the moon https://example.com/chart',
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.snapshotBases).toHaveLength(0);
  });

  it('malformed addresses are rejected, valid ones survive', async () => {
    const { useCase } = buildUseCase();
    const result = await useCase.execute({
      kolId: 'kol-1',
      messageId: 9,
      occurredAt: new Date('2026-09-24T12:00:00.000Z'),
      text: `bad 0x1234 and bad 0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ but good ${USDC}`,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].contractAddress.value).toBe(USDC.toLowerCase());
  });

  it('double delivery (realtime + catch-up) collapses to the same rows (guard only, P1)', async () => {
    const { useCase, repo } = buildUseCase();
    const input = {
      kolId: 'kol-1',
      messageId: 42,
      occurredAt: new Date('2026-09-24T12:00:00.000Z'),
      text: `ape ${USDC} and ${WETH} plus sol play ${WSOL}`,
    };
    await useCase.execute(input);
    await useCase.execute(input);

    expect(await repo.count()).toBe(3);
  });
});
