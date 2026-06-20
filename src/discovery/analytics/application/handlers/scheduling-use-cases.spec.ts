import { EnqueueEvaluationJobsUseCase } from 'discovery/analytics/application/handlers/enqueue-evaluation-jobs.use-case';
import { ProcessDueEvaluationJobsUseCase } from 'discovery/analytics/application/handlers/process-due-evaluation-jobs.use-case';
import { EvaluateCallPerformanceUseCase } from 'discovery/analytics/application/handlers/evaluate-call-performance.use-case';
import { CallEvaluationJobRepository } from 'discovery/analytics/application/ports/call-evaluation-job.repository';
import { CallPerformanceRepository } from 'discovery/analytics/application/ports/call-performance.repository';
import { ChannelReputationStatsRepository } from 'discovery/analytics/application/ports/channel-reputation-stats.repository';
import { CallEvaluationJob } from 'discovery/analytics/domain/entities/call-evaluation-job.entity';
import { EvaluationHorizonVo } from 'discovery/analytics/domain/value-objects/evaluation-horizon.vo';
import { CallPerformance } from 'discovery/analytics/domain/value-objects/call-performance.vo';
import { Outcome } from 'discovery/analytics/domain/value-objects/outcome.vo';
import { ChannelReputationStats } from 'discovery/analytics/domain/value-objects/channel-reputation-stats.vo';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { recomputeStats } from 'discovery/analytics/application/handlers/evaluate-call-performance.use-case';
import {
  PerformanceEvaluatorPort,
  PerformanceEvaluation,
} from 'discovery/analytics/domain/ports/performance-evaluator.port';

class FakeJobRepo extends CallEvaluationJobRepository {
  public store = new Map<string, CallEvaluationJob>();
  public async save(j: CallEvaluationJob): Promise<void> {
    await Promise.resolve();
    this.store.set(j.id, j);
  }
  public async findById(id: string): Promise<CallEvaluationJob | null> {
    await Promise.resolve();
    return this.store.get(id) ?? null;
  }
  public async findDue(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<CallEvaluationJob>> {
    await Promise.resolve();
    const nowMs = now.getTime();
    return Array.from(this.store.values())
      .filter((j) => j.status === 'PENDING' && j.scheduledAt.getTime() <= nowMs)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, limit);
  }
  public async findPendingForCall(
    ch: string,
    chain: string,
    addr: string,
    ts: Date,
  ): Promise<ReadonlyArray<CallEvaluationJob>> {
    await Promise.resolve();
    return Array.from(this.store.values()).filter(
      (j) =>
        j.channelId === ch &&
        j.chain.value === chain &&
        j.address === addr.toLowerCase() &&
        j.callTimestamp.getTime() === ts.getTime() &&
        j.status !== 'COMPLETED',
    );
  }
  public async count(): Promise<number> {
    await Promise.resolve();
    return this.store.size;
  }
}

class FakePerfRepo extends CallPerformanceRepository {
  public store = new Map<string, CallPerformance>();
  public async save(p: CallPerformance): Promise<void> {
    await Promise.resolve();
    this.store.set(`${p.channelId}:${p.tokenId}`, p);
  }
  public async findByChannel(
    channelId: string,
  ): Promise<ReadonlyArray<CallPerformance>> {
    await Promise.resolve();
    return Array.from(this.store.values()).filter(
      (p) => p.channelId === channelId,
    );
  }
  public async findByToken(
    tokenId: string,
  ): Promise<ReadonlyArray<CallPerformance>> {
    await Promise.resolve();
    return Array.from(this.store.values()).filter((p) => p.tokenId === tokenId);
  }
  public async findAll(): Promise<ReadonlyArray<CallPerformance>> {
    await Promise.resolve();
    return Array.from(this.store.values());
  }
}

class FakeStatsRepo extends ChannelReputationStatsRepository {
  public store = new Map<string, ChannelReputationStats>();
  public async save(s: ChannelReputationStats): Promise<void> {
    await Promise.resolve();
    this.store.set(s.channelId, s);
  }
  public async findByChannel(
    channelId: string,
  ): Promise<ChannelReputationStats | null> {
    await Promise.resolve();
    return this.store.get(channelId) ?? null;
  }
  public async findAll(): Promise<ReadonlyArray<ChannelReputationStats>> {
    await Promise.resolve();
    return Array.from(this.store.values());
  }
  public async findTop(
    limit: number,
  ): Promise<ReadonlyArray<ChannelReputationStats>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(0, limit);
  }
}

class FakeEvaluator extends PerformanceEvaluatorPort {
  public constructor(
    private readonly outcome: PerformanceEvaluation['outcome'],
  ) {
    super();
  }
  public evaluateCall(): Promise<PerformanceEvaluation> {
    return Promise.resolve({
      athMultiple: 3.5,
      mcAtCall: 100_000,
      mcNow: 350_000,
      isHoneypot: false,
      isRugged: false,
      outcome: this.outcome,
    });
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('EnqueueEvaluationJobsUseCase', () => {
  it('enqueues one job per horizon by default', async () => {
    const repo = new FakeJobRepo();
    const useCase = new EnqueueEvaluationJobsUseCase(repo);

    const jobs = await useCase.execute({
      channelId: 'SpyDefi',
      chain: 'ethereum',
      address: EVM,
      callTimestamp: new Date('2026-01-01T00:00:00Z'),
      mcAtCall: 100_000,
    });

    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.horizon.value).sort()).toEqual([
      '24H',
      '30D',
      '7D',
    ]);
  });

  it('respects custom horizons', async () => {
    const repo = new FakeJobRepo();
    const useCase = new EnqueueEvaluationJobsUseCase(repo);

    const jobs = await useCase.execute({
      channelId: 'SpyDefi',
      chain: 'ethereum',
      address: EVM,
      callTimestamp: new Date('2026-01-01T00:00:00Z'),
      mcAtCall: 100_000,
      horizons: [EvaluationHorizonVo.H24, EvaluationHorizonVo.D7],
    });

    expect(jobs).toHaveLength(2);
  });

  it('is idempotent — re-enqueueing same call does not duplicate', async () => {
    const repo = new FakeJobRepo();
    const useCase = new EnqueueEvaluationJobsUseCase(repo);
    const params = {
      channelId: 'SpyDefi',
      chain: 'ethereum',
      address: EVM,
      callTimestamp: new Date('2026-01-01T00:00:00Z'),
      mcAtCall: 100_000,
    };

    const first = await useCase.execute(params);
    const second = await useCase.execute(params);

    expect(first).toHaveLength(3);
    expect(second).toHaveLength(0); // all already exist
    expect(repo.store.size).toBe(3);
  });

  it('schedules jobs at the right wall-clock time', async () => {
    const repo = new FakeJobRepo();
    const useCase = new EnqueueEvaluationJobsUseCase(repo);
    const callTs = new Date('2026-06-01T12:00:00Z');

    const jobs = await useCase.execute({
      channelId: 'SpyDefi',
      chain: 'ethereum',
      address: EVM,
      callTimestamp: callTs,
      mcAtCall: 100_000,
    });

    const h24 = jobs.find((j) => j.horizon.value === '24H')!;
    const d7 = jobs.find((j) => j.horizon.value === '7D')!;
    expect(h24.scheduledAt.toISOString()).toBe('2026-06-02T12:00:00.000Z');
    expect(d7.scheduledAt.toISOString()).toBe('2026-06-08T12:00:00.000Z');
  });
});

describe('ProcessDueEvaluationJobsUseCase', () => {
  it('processes due jobs successfully', async () => {
    const jobRepo = new FakeJobRepo();
    const perfRepo = new FakePerfRepo();
    const statsRepo = new FakeStatsRepo();
    const evaluator = new FakeEvaluator('STRONG');

    const evaluate = new EvaluateCallPerformanceUseCase(
      perfRepo,
      statsRepo,
      evaluator,
    );

    // Seed a due job: callTimestamp 25h ago → 24h horizon → scheduledAt 1h ago (DUE)
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const job = CallEvaluationJob.enqueue({
      channelId: 'SpyDefi',
      chain: ChainId.ETHEREUM,
      address: EVM,
      callTimestamp: longAgo,
      mcAtCall: 100_000,
      horizon: EvaluationHorizonVo.H24,
    });
    await jobRepo.save(job);

    const process = new ProcessDueEvaluationJobsUseCase(jobRepo, evaluate);
    const result = await process.execute(50);

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    // Job should now be COMPLETED
    const after = await jobRepo.findById(job.id);
    expect(after!.status).toBe('COMPLETED');

    // Performance should have been recorded
    expect(perfRepo.store.size).toBe(1);
    expect(statsRepo.store.size).toBe(1);
    const stats = statsRepo.store.get('SpyDefi')!;
    expect(stats.score).toBeGreaterThan(0.5);
  });

  it('marks job FAILED when evaluator throws', async () => {
    const jobRepo = new FakeJobRepo();
    const perfRepo = new FakePerfRepo();
    const statsRepo = new FakeStatsRepo();
    const throwingEvaluator = new (class extends PerformanceEvaluatorPort {
      public evaluateCall(): Promise<PerformanceEvaluation> {
        return Promise.reject(new Error('dexscreener down'));
      }
    })();

    const evaluate = new EvaluateCallPerformanceUseCase(
      perfRepo,
      statsRepo,
      throwingEvaluator,
    );
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const job = CallEvaluationJob.enqueue({
      channelId: 'SpyDefi',
      chain: ChainId.ETHEREUM,
      address: EVM,
      callTimestamp: longAgo,
      mcAtCall: 100_000,
      horizon: EvaluationHorizonVo.H24,
    });
    await jobRepo.save(job);

    const process = new ProcessDueEvaluationJobsUseCase(jobRepo, evaluate);
    const result = await process.execute(50);

    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);

    const after = await jobRepo.findById(job.id);
    expect(after!.status).toBe('FAILED');
    expect(after!.lastError).toContain('dexscreener down');
  });

  it('does not process jobs whose scheduledAt is in the future', async () => {
    const jobRepo = new FakeJobRepo();
    const perfRepo = new FakePerfRepo();
    const statsRepo = new FakeStatsRepo();
    const evaluator = new FakeEvaluator('GOOD');
    const evaluate = new EvaluateCallPerformanceUseCase(
      perfRepo,
      statsRepo,
      evaluator,
    );

    // Seed a job whose scheduledAt is in the future (callTimestamp 1h ago → 24h → future)
    const future = new Date(Date.now() - 60 * 60 * 1000);
    const job = CallEvaluationJob.enqueue({
      channelId: 'SpyDefi',
      chain: ChainId.ETHEREUM,
      address: EVM,
      callTimestamp: future,
      mcAtCall: 100_000,
      horizon: EvaluationHorizonVo.H24,
    });
    await jobRepo.save(job);

    const process = new ProcessDueEvaluationJobsUseCase(jobRepo, evaluate);
    const result = await process.execute(50);

    expect(result.processed).toBe(0);
    const after = await jobRepo.findById(job.id);
    expect(after!.status).toBe('PENDING');
  });

  it('respects batch size limit', async () => {
    const jobRepo = new FakeJobRepo();
    const perfRepo = new FakePerfRepo();
    const statsRepo = new FakeStatsRepo();
    const evaluator = new FakeEvaluator('GOOD');
    const evaluate = new EvaluateCallPerformanceUseCase(
      perfRepo,
      statsRepo,
      evaluator,
    );

    // Seed 5 due jobs (callTimestamp 25h ago → 24h horizon → all due now)
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      const job = CallEvaluationJob.enqueue({
        channelId: `chan-${i}`,
        chain: ChainId.ETHEREUM,
        address: `0x${i.toString().padStart(40, '0')}`,
        callTimestamp: longAgo,
        mcAtCall: 100_000,
        horizon: EvaluationHorizonVo.H24,
      });
      await jobRepo.save(job);
    }

    const process = new ProcessDueEvaluationJobsUseCase(jobRepo, evaluate);
    const result = await process.execute(2);

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(2);
  });
});

// Helper: ensure the existing recomputeStats pure function is exercised
describe('recomputeStats integration with job processing', () => {
  it('aggregates multiple performance records into one channel stats', () => {
    const perfs = [
      CallPerformance.create({
        channelId: 'SpyDefi',
        tokenId: 'evm:0xaaa',
        outcome: Outcome.STRONG,
        mcAtCall: 100_000,
        athMultiple: 5,
        callTimestamp: new Date(),
      }),
      CallPerformance.create({
        channelId: 'SpyDefi',
        tokenId: 'evm:0xbbb',
        outcome: Outcome.FAILED,
        mcAtCall: 50_000,
        athMultiple: 0.1,
        callTimestamp: new Date(),
      }),
    ];
    const stats = recomputeStats('SpyDefi', perfs);
    expect(stats.totalCalls).toBe(2);
    expect(stats.score).toBeGreaterThan(0.3);
    expect(stats.score).toBeLessThan(0.7);
  });
});
