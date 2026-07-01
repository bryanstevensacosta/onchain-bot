import { RegisterMonitoredCallUseCase } from './register-monitored-call.use-case';
import {
  MonitoredCallRepository,
  MonitoredCallRecord,
} from '../ports/monitored-call.repository';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { TokenSnapshot } from 'token/enrichment/domain/entities/token-snapshot.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { DomainError } from 'shared/kernel/domain-error';

class FakeMonitoredCallRepo extends MonitoredCallRepository {
  public saved: MonitoredCallRecord[] = [];
  public existing: MonitoredCallRecord | null = null;

  async findByCallId(_callId: string): Promise<MonitoredCallRecord | null> {
    return this.existing;
  }

  async save(record: MonitoredCallRecord): Promise<MonitoredCallRecord> {
    this.saved.push(record);
    return record;
  }
}

class FakeSnapshotRepo extends TokenSnapshotRepository {
  public snapshot: TokenSnapshot | null = null;

  async save(): Promise<void> {
    return;
  }

  async findByChainAndAddress(): Promise<TokenSnapshot | null> {
    return this.snapshot;
  }

  async findRecent(): Promise<ReadonlyArray<TokenSnapshot>> {
    return [];
  }
}

describe('RegisterMonitoredCallUseCase', () => {
  it('uses snapshot.marketCapUsd when snapshot exists with marketCapUsd', async () => {
    const monitoredCallRepo = new FakeMonitoredCallRepo();
    const snapshotRepo = new FakeSnapshotRepo();

    const snapshot = TokenSnapshot.create({
      chain: ChainId.fromString('solana'),
      address: 'ABC123',
      pairs: [],
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      marketCapUsd: 50000,
      fdvUsd: null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: null,
      symbol: null,
      name: null,
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
      sources: [],
    });
    snapshotRepo.snapshot = snapshot;

    const uc = new RegisterMonitoredCallUseCase(
      monitoredCallRepo,
      snapshotRepo,
    );

    const result = await uc.execute({
      callId: 'call-1',
      chain: 'solana',
      address: 'ABC123',
      publishedAt: new Date(),
    });

    expect(result.mcAtCall).toBe(50000);
    expect(monitoredCallRepo.saved).toHaveLength(1);
  });

  it('falls back to input.mcAtCall when snapshot missing marketCapUsd', async () => {
    const monitoredCallRepo = new FakeMonitoredCallRepo();
    const snapshotRepo = new FakeSnapshotRepo();

    const snapshot = TokenSnapshot.create({
      chain: ChainId.fromString('solana'),
      address: 'ABC123',
      pairs: [],
      priceUsd: 0.5,
      liquidityUsd: 10000,
      volume24hUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: null,
      symbol: 'TEST',
      name: 'Test Token',
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
      sources: [],
    });
    snapshotRepo.snapshot = snapshot;

    const uc = new RegisterMonitoredCallUseCase(
      monitoredCallRepo,
      snapshotRepo,
    );

    const result = await uc.execute({
      callId: 'call-2',
      chain: 'solana',
      address: 'ABC123',
      publishedAt: new Date(),
      mcAtCall: 25000,
    });

    expect(result.mcAtCall).toBe(25000);
    expect(monitoredCallRepo.saved).toHaveLength(1);
  });

  it('throws when neither snapshot nor fallback available', async () => {
    const monitoredCallRepo = new FakeMonitoredCallRepo();
    const snapshotRepo = new FakeSnapshotRepo();
    snapshotRepo.snapshot = null;

    const uc = new RegisterMonitoredCallUseCase(
      monitoredCallRepo,
      snapshotRepo,
    );

    await expect(
      uc.execute({
        callId: 'call-3',
        chain: 'solana',
        address: 'ABC123',
        publishedAt: new Date(),
      }),
    ).rejects.toThrow(DomainError);
  });

  it('returns existing record if callId already exists', async () => {
    const monitoredCallRepo = new FakeMonitoredCallRepo();
    const snapshotRepo = new FakeSnapshotRepo();

    const existingRecord: MonitoredCallRecord = {
      id: '1',
      callId: 'call-1',
      chain: 'solana',
      address: 'ABC123',
      mcAtCall: 10000,
      publishedAt: new Date(),
      lastEvaluatedAt: null,
    };
    monitoredCallRepo.existing = existingRecord;

    const uc = new RegisterMonitoredCallUseCase(
      monitoredCallRepo,
      snapshotRepo,
    );

    const result = await uc.execute({
      callId: 'call-1',
      chain: 'solana',
      address: 'ABC123',
      publishedAt: new Date(),
    });

    expect(result).toBe(existingRecord);
    expect(monitoredCallRepo.saved).toHaveLength(0);
  });
});
