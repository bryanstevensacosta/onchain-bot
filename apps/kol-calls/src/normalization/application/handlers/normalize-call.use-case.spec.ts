import { Logger } from '@nestjs/common';
import { ParsedCall } from '../../../parsing/domain/entities/parsed-call.entity';
import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';
import { NormalizedMentionRepository } from '../ports/normalized-mention.repository';
import { InMemoryNormalizedMentionRepository } from '../../infrastructure/repositories/in-memory-normalized-mention.repository';
import { NormalizeCallUseCase } from './normalize-call.use-case';

const CONTRACT = `0x${'a'.repeat(40)}`;
const OCCURRED_AT = new Date('2026-09-25T12:00:00.000Z');

function parsed(
  kolId: string,
  messageId: number,
  contractIndex = 0,
): ParsedCall {
  return ParsedCall.create({
    kolId,
    messageId,
    contractIndex,
    occurredAt: OCCURRED_AT,
    contractAddress: NormalizedAddress.fromEvm(CONTRACT),
    ticker: 'WIF',
    name: 'dogwifhat',
    chart: null,
    handle: `@${kolId}`,
    channelId: null,
  });
}

function setup(): {
  useCase: NormalizeCallUseCase;
  repo: NormalizedMentionRepository;
} {
  const repo = new InMemoryNormalizedMentionRepository();
  const useCase = new NormalizeCallUseCase(repo);
  return { useCase, repo };
}

describe('NormalizeCallUseCase (P1: mention index, one row per mention)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('same contract x 2 kols x 2 messages -> 4 normalized rows', async () => {
    const { useCase, repo } = setup();
    const calls = [
      parsed('kol-a', 1),
      parsed('kol-a', 2),
      parsed('kol-b', 1),
      parsed('kol-b', 2),
    ];

    const result = await useCase.execute({ parsed: calls });

    expect(result.normalized).toHaveLength(4);
    expect(result.discarded).toBe(0);
    expect(await repo.count()).toBe(4);
    expect(new Set(result.normalized.map((m) => m.id)).size).toBe(4);
  });

  it('emits one normalization.call.normalized event per mention (direct return, no bus)', async () => {
    const { useCase } = setup();
    const calls = [
      parsed('kol-a', 1),
      parsed('kol-a', 2),
      parsed('kol-b', 1),
      parsed('kol-b', 2),
    ];

    const result = await useCase.execute({ parsed: calls });

    expect(result.events).toHaveLength(4);
    for (const event of result.events) {
      expect(event.eventName).toBe('normalization.call.normalized');
    }
    expect(result.events.map((e) => e.aggregateId).sort()).toEqual(
      result.normalized.map((m) => m.id).sort(),
    );
  });

  it('keeps repeats as first-class rows (no single card per coin)', async () => {
    const { useCase } = setup();
    const calls = [
      parsed('kol-a', 1),
      parsed('kol-a', 2),
      parsed('kol-b', 1),
      parsed('kol-b', 2),
    ];

    const result = await useCase.execute({ parsed: calls });

    const addresses = result.normalized.map((m) => m.address.value);
    expect(new Set(addresses).size).toBe(1);
    expect(result.normalized).toHaveLength(calls.length);
  });

  it('double-delivery (realtime + catch-up) upserts the same rows', async () => {
    const { useCase, repo } = setup();
    const calls = [parsed('kol-a', 1), parsed('kol-b', 2)];

    await useCase.execute({ parsed: calls });
    const second = await useCase.execute({ parsed: calls });

    expect(second.normalized).toHaveLength(2);
    expect(second.discarded).toBe(0);
    expect(await repo.count()).toBe(2);
  });

  it('discards the illegible mention with a log and keeps the pipeline alive', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const { useCase, repo } = setup();
    const illegible = {} as unknown as ParsedCall;
    const calls = [parsed('kol-a', 1), illegible, parsed('kol-b', 2)];

    const result = await useCase.execute({ parsed: calls });

    expect(result.normalized).toHaveLength(2);
    expect(result.events).toHaveLength(2);
    expect(result.discarded).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    expect(await repo.count()).toBe(2);
  });

  it('empty parsed yields empty normalized, never a throw', async () => {
    const { useCase } = setup();

    const result = await useCase.execute({ parsed: [] });

    expect(result.normalized).toHaveLength(0);
    expect(result.events).toHaveLength(0);
    expect(result.discarded).toBe(0);
  });
});
