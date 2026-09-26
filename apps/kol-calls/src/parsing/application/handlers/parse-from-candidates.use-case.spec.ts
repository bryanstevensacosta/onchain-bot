import { Logger } from '@nestjs/common';
import { ExtractionCandidate } from '../../../extraction/domain/entities/extraction-candidate.entity';
import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';
import { Ticker } from '../../../extraction/domain/value-objects/ticker.vo';
import { ParserPort } from '../../domain/ports/parser.port';
import { ParsedCallRepository } from '../ports/parsed-call.repository';
import { InMemoryParsedCallRepository } from '../../infrastructure/repositories/in-memory-parsed-call.repository';
import { HeuristicParserAdapter } from '../../infrastructure/adapters/heuristic-parser.adapter';
import { ParseFromCandidatesUseCase } from './parse-from-candidates.use-case';

const KOL_ID = '123456789';
const MESSAGE_ID = 42;
const OCCURRED_AT = new Date('2026-09-24T12:00:00.000Z');

function candidate(
  index: number,
  addressHexChar: string,
  tickers: ReadonlyArray<Ticker> = [],
): ExtractionCandidate {
  return ExtractionCandidate.create({
    kolId: KOL_ID,
    messageId: MESSAGE_ID,
    occurredAt: OCCURRED_AT,
    contractAddress: NormalizedAddress.fromEvm(
      `0x${addressHexChar.repeat(40)}`,
    ),
    contractIndex: index,
    tickers,
    urls: [],
    handle: '@alpha',
    channelUrl: null,
    channelId: null,
    channelTitle: null,
  });
}

function setup(parser?: ParserPort): {
  useCase: ParseFromCandidatesUseCase;
  repo: ParsedCallRepository;
} {
  const repo = new InMemoryParsedCallRepository();
  const useCase = new ParseFromCandidatesUseCase(
    parser ?? new HeuristicParserAdapter(),
    repo,
  );
  return { useCase, repo };
}

describe('ParseFromCandidatesUseCase (P5: 1:1, no collapse)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses one ParsedCall per candidate (3 mentions -> 3 parsed)', async () => {
    const { useCase } = setup();
    const candidates = [candidate(0, 'a'), candidate(1, 'b'), candidate(2, 'c')];

    const result = await useCase.execute({
      candidates,
      rawText: 'ape $BONK mc $180K https://dexscreener.com/solana/abc',
    });

    expect(result.parsed).toHaveLength(candidates.length);
    expect(result.discarded).toBe(0);
  });

  it('preserves each mention address (NO collapse to addresses[0])', async () => {
    const { useCase } = setup();
    const candidates = [candidate(0, 'a'), candidate(1, 'b'), candidate(2, 'c')];

    const result = await useCase.execute({ candidates, rawText: 'gem' });

    const addresses = result.parsed.map((p) => p.address.value);
    expect(new Set(addresses).size).toBe(3);
    expect(addresses).toEqual(
      candidates.map((c) => c.contractAddress.value),
    );
    expect(result.parsed.map((p) => p.id)).toEqual(
      candidates.map((c) => c.id),
    );
  });

  it('keeps per-candidate ticker over message-level heuristic', async () => {
    const { useCase } = setup();
    const candidates = [
      candidate(0, 'a', [Ticker.fromString('WIF')]),
      candidate(1, 'b'),
    ];

    const result = await useCase.execute({
      candidates,
      rawText: 'ape $BONK',
    });

    expect(result.parsed[0].ticker).toBe('WIF');
    expect(result.parsed[1].ticker).toBe('BONK');
  });

  it('discards the illegible candidate with a log and keeps the pipeline alive', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const { useCase, repo } = setup();
    const illegible = {} as unknown as ExtractionCandidate;
    const candidates = [candidate(0, 'a'), illegible, candidate(2, 'c')];

    const result = await useCase.execute({ candidates, rawText: 'gem' });

    expect(result.parsed).toHaveLength(2);
    expect(result.discarded).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    expect(await repo.count()).toBe(2);
  });

  it('empty candidates yield empty parsed, never a throw', async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ candidates: [], rawText: '' });

    expect(result.parsed).toHaveLength(0);
    expect(result.discarded).toBe(0);
  });
});
