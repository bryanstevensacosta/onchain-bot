import { Logger } from '@nestjs/common';
import {
  MarketData,
  MarketDataPort,
  emptyMarketData,
} from '../../../enrichment/domain/ports/market-data.port';
import { MentionSnapshot } from '../../../snapshot/domain/entities/mention-snapshot.entity';
import { SnapshotWriterPort } from '../../../enrichment/domain/ports/snapshot-writer.port';
import { InMemoryMentionSnapshotRepository } from '../../../snapshot/infrastructure/repositories/in-memory-mention-snapshot.repository';
import { EnrichmentOrchestratorService } from './enrichment-orchestrator.service';

const OCCURRED_AT = new Date('2026-09-25T12:00:00.000Z');
const INGESTED_AT = new Date('2026-09-25T12:00:05.000Z');

class StubPort extends MarketDataPort {
  public readonly name: string;
  public calls = 0;
  public constructor(
    name: string,
    private readonly behavior: MarketData | null | Error,
  ) {
    super();
    this.name = name;
  }
  public async fetch(): Promise<MarketData | null> {
    this.calls += 1;
    if (this.behavior instanceof Error) {
      throw this.behavior;
    }
    return this.behavior;
  }
}

function data(partial: Partial<MarketData>): MarketData {
  return { ...emptyMarketData(), ...partial };
}

function input() {
  return {
    mentionId: 'kol-a:1:0',
    kolId: 'kol-a',
    messageId: 1,
    contractIndex: 0,
    chain: 'evm',
    address: `0x${'a'.repeat(40)}`,
    occurred_at_telegram: OCCURRED_AT,
    ingested_at_kol: INGESTED_AT,
  };
}

function setup(providers: MarketDataPort[]): {
  service: EnrichmentOrchestratorService;
  writer: SnapshotWriterPort & { count(): Promise<number> };
} {
  const writer =
    new InMemoryMentionSnapshotRepository() as unknown as SnapshotWriterPort & {
      count(): Promise<number>;
    };
  const service = new EnrichmentOrchestratorService(providers, writer);
  return { service, writer };
}

describe('EnrichmentOrchestratorService (dual-port, first-non-null cascade)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('merges first-non-null per field across providers (backend cascade mirror)', async () => {
    const p1 = new StubPort('p1', data({ priceUsd: 10, marketCapUsd: null }));
    const p2 = new StubPort('p2', data({ priceUsd: 99, marketCapUsd: 500 }));
    const { service } = setup([p1, p2]);

    const { snapshot, errors } = await service.enrich(input());

    expect(errors).toHaveLength(0);
    expect(snapshot.priceUsd).toBe(10);
    expect(snapshot.marketCapUsd).toBe(500);
  });

  it('provider down -> null + next in cascade (silent-null fallback)', async () => {
    const down = new StubPort('down', new Error('connection refused'));
    const next = new StubPort('next', data({ priceUsd: 7 }));
    const { service } = setup([down, next]);

    const { snapshot, errors } = await service.enrich(input());

    expect(next.calls).toBe(1);
    expect(snapshot.priceUsd).toBe(7);
    expect(errors).toHaveLength(1);
    expect(errors[0].provider).toBe('down');
  });

  it('all providers null -> snapshot still written with null market fields', async () => {
    const p1 = new StubPort('p1', null);
    const p2 = new StubPort('p2', new Error('timeout'));
    const { service, writer } = setup([p1, p2]);

    const { snapshot, errors } = await service.enrich(input());

    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.marketCapUsd).toBeNull();
    expect(snapshot.hasMarketData()).toBe(false);
    expect(errors).toHaveLength(2);
    expect(await writer.count()).toBe(1);
  });

  it('snapshot carries all 4 P26 timestamps; enriched_at === snapshot_at', async () => {
    const p1 = new StubPort('p1', data({ priceUsd: 1 }));
    const { service } = setup([p1]);

    const before = new Date();
    const { snapshot } = await service.enrich(input());
    const after = new Date();

    expect(snapshot.occurred_at_telegram).toEqual(OCCURRED_AT);
    expect(snapshot.ingested_at_kol).toEqual(INGESTED_AT);
    expect(snapshot.enriched_at.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(snapshot.enriched_at.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(snapshot.snapshot_at).toEqual(snapshot.enriched_at);
  });

  it('writes via SnapshotWriterPort (P27: enrichment never touches the table)', async () => {
    const p1 = new StubPort('p1', data({ priceUsd: 3 }));
    const writer = new InMemoryMentionSnapshotRepository();
    const saveSpy = jest.spyOn(writer, 'save');
    const service = new EnrichmentOrchestratorService([p1], writer);

    const { snapshot } = await service.enrich(input());

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const stored = await writer.findByMentionId(snapshot.id);
    expect(stored).not.toBeNull();
    expect((stored as MentionSnapshot).priceUsd).toBe(3);
  });
});
