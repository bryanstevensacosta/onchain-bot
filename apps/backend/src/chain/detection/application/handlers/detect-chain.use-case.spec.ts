import { DetectChainUseCase } from 'chain/detection/application/handlers/detect-chain.use-case';
import { ChainDetectionRepository } from 'chain/detection/application/ports/chain-detection.repository';
import { ChainDetectionEventPublisher } from 'chain/detection/application/ports/chain-detection-event.publisher';
import {
  ChainProberPort,
  ProbeResult,
} from 'chain/detection/domain/ports/chain-prober.port';
import { ChainDetectionResult } from 'chain/detection/domain/entities/chain-detection-result.entity';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeProber extends ChainProberPort {
  public constructor(
    public readonly chainName: string,
    private readonly nextResult: ProbeResult,
  ) {
    super();
  }
  public probe(): Promise<ProbeResult> {
    return Promise.resolve(this.nextResult);
  }
}

class InMemoryRepo extends ChainDetectionRepository {
  public readonly store = new Map<string, ChainDetectionResult>();
  public async save(r: ChainDetectionResult): Promise<void> {
    await Promise.resolve();
    this.store.set(r.id, r);
  }
  public async findByAddress(a: string): Promise<ChainDetectionResult | null> {
    await Promise.resolve();
    return this.store.get(a.toLowerCase()) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ChainDetectionResult>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}

class InMemoryPublisher extends ChainDetectionEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(e: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(e);
  }
}

describe('DetectChainUseCase', () => {
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;

  beforeEach(() => {
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
  });

  it('picks EVM when EVM prober scores higher than Solana', async () => {
    const probers = [
      new FakeProber('ethereum', {
        responded: true,
        isContract: true,
        notes: [],
      }),
      new FakeProber('solana', {
        responded: false,
        isContract: null,
        notes: ['solana:format_invalid_base58'],
      }),
    ];
    const useCase = new DetectChainUseCase(probers, repo, publisher);

    const view = await useCase.execute({
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    });

    expect(view.resolvedChain).toBe('ethereum');
    expect(view.isContract).toBe(true);
    expect(view.scores).toHaveLength(2);
    expect(view.scores.find((s) => s.chain === 'ethereum')!.points).toBe(30); // 20 rpc + 10 code
    expect(view.scores.find((s) => s.chain === 'solana')!.points).toBe(0);
  });

  it('picks Solana when Solana prober scores higher', async () => {
    const probers = [
      new FakeProber('ethereum', {
        responded: false,
        isContract: null,
        notes: ['evm:format_invalid'],
      }),
      new FakeProber('solana', {
        responded: true,
        isContract: true,
        notes: [],
      }),
    ];
    const useCase = new DetectChainUseCase(probers, repo, publisher);

    const view = await useCase.execute({
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    });

    expect(view.resolvedChain).toBe('solana');
    expect(view.scores.find((s) => s.chain === 'solana')!.points).toBe(60); // 30 rpc + 30 exists
  });

  it('handles prober rejection gracefully (Promise.allSettled)', async () => {
    const probers = [
      new FakeProber('ethereum', {
        responded: true,
        isContract: true,
        notes: [],
      }),
      new (class extends ChainProberPort {
        public readonly chainName = 'solana';
        public probe(): Promise<ProbeResult> {
          return Promise.reject(new Error('RPC down'));
        }
      })(),
    ];
    const useCase = new DetectChainUseCase(probers, repo, publisher);

    const view = await useCase.execute({
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    });

    expect(view.resolvedChain).toBe('ethereum');
    expect(
      view.scores.find((s) => s.chain === 'ethereum')!.points,
    ).toBeGreaterThan(0);
    expect(view.scores.find((s) => s.chain === 'solana')!.points).toBe(0);
    expect(view.scores.find((s) => s.chain === 'solana')!.reasons).toContain(
      'probe:solana:error',
    );
  });

  it('throws when no prober responds at all', async () => {
    const probers = [
      new FakeProber('ethereum', {
        responded: false,
        isContract: null,
        notes: ['evm:format_invalid'],
      }),
      new FakeProber('solana', {
        responded: false,
        isContract: null,
        notes: ['solana:format_invalid_base58'],
      }),
    ];
    const useCase = new DetectChainUseCase(probers, repo, publisher);

    await expect(useCase.execute({ address: 'garbage' })).rejects.toThrow();
  });

  it('returns cached result on second call (idempotent)', async () => {
    const evmProber = new FakeProber('ethereum', {
      responded: true,
      isContract: true,
      notes: [],
    });
    const probers = [
      evmProber,
      new FakeProber('solana', {
        responded: false,
        isContract: null,
        notes: [],
      }),
    ];
    const useCase = new DetectChainUseCase(probers, repo, publisher);

    const v1 = await useCase.execute({
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    });
    const v2 = await useCase.execute({
      address: '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045',
    });

    expect(v1.address).toBe(v2.address);
    expect(v1.detectedAt).toBe(v2.detectedAt);
    expect(repo.store.size).toBe(1);
    expect(publisher.published).toHaveLength(1); // only first call published
  });

  it('persists result and publishes event on success', async () => {
    const probers = [
      new FakeProber('ethereum', {
        responded: true,
        isContract: true,
        notes: [],
      }),
      new FakeProber('solana', {
        responded: false,
        isContract: null,
        notes: [],
      }),
    ];
    const useCase = new DetectChainUseCase(probers, repo, publisher);

    await useCase.execute({
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    });

    expect(repo.store.size).toBe(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe(
      'chain-detection.chain.detected',
    );
  });

  it('throws when no probers are registered', () => {
    expect(() => new DetectChainUseCase([], repo, publisher)).toThrow();
  });
});
