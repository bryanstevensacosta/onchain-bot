import { EvaluationHorizonVo } from 'discovery/analytics/domain/value-objects/evaluation-horizon.vo';
import { CallEvaluationJob } from 'discovery/analytics/domain/entities/call-evaluation-job.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const CALL_TS = new Date('2026-01-01T00:00:00Z');

describe('EvaluationHorizonVo', () => {
  it('exposes the 3 supported horizons', () => {
    expect(EvaluationHorizonVo.H24.value).toBe('24H');
    expect(EvaluationHorizonVo.D7.value).toBe('7D');
    expect(EvaluationHorizonVo.D30.value).toBe('30D');
  });

  it('hours() returns 24 / 168 / 720', () => {
    expect(EvaluationHorizonVo.H24.hours()).toBe(24);
    expect(EvaluationHorizonVo.D7.hours()).toBe(168);
    expect(EvaluationHorizonVo.D30.hours()).toBe(720);
  });

  it('firesAt() adds hours to callTimestamp', () => {
    const t = EvaluationHorizonVo.H24.firesAt(CALL_TS);
    expect(t.getTime() - CALL_TS.getTime()).toBe(24 * 60 * 60 * 1000);
    const t7 = EvaluationHorizonVo.D7.firesAt(CALL_TS);
    expect(t7.getTime() - CALL_TS.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    const t30 = EvaluationHorizonVo.D30.firesAt(CALL_TS);
    expect(t30.getTime() - CALL_TS.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('fromString parses valid values', () => {
    expect(EvaluationHorizonVo.fromString('24h').value).toBe('24H');
  });

  it('fromString throws on invalid', () => {
    expect(() => EvaluationHorizonVo.fromString('1H')).toThrow();
  });

  it('defaultHorizons returns all three', () => {
    const def = EvaluationHorizonVo.defaultHorizons();
    expect(def).toHaveLength(3);
    expect(def.map((h) => h.value)).toEqual(['24H', '7D', '30D']);
  });
});

describe('CallEvaluationJob', () => {
  const baseInput = {
    channelId: 'SpyDefi',
    chain: ChainId.ETHEREUM,
    address: EVM,
    callTimestamp: CALL_TS,
    mcAtCall: 100_000,
  };

  it('enqueue creates a PENDING job with correct scheduledAt', () => {
    const job = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    expect(job.status).toBe('PENDING');
    expect(job.scheduledAt.getTime() - CALL_TS.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(job.attempts).toBe(0);
    expect(job.id).toContain('24H');
  });

  it('enqueue rejects empty channelId', () => {
    expect(() =>
      CallEvaluationJob.enqueue({
        ...baseInput,
        channelId: '',
        horizon: EvaluationHorizonVo.H24,
      }),
    ).toThrow();
  });

  it('buildId is deterministic and stable across enqueues', () => {
    const a = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    const b = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    expect(a.id).toBe(b.id);
  });

  it('buildId differs across horizons for the same call', () => {
    const a = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    const b = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.D7,
    });
    expect(a.id).not.toBe(b.id);
  });

  it('isDue is false when scheduledAt is in the future', () => {
    // callTimestamp 1h in the past → 24h horizon → scheduledAt 23h in the future
    const futureJob = CallEvaluationJob.enqueue({
      ...baseInput,
      callTimestamp: new Date(Date.now() - 60 * 60 * 1000),
      horizon: EvaluationHorizonVo.H24,
    });
    expect(futureJob.isDue).toBe(false);
  });

  it('isDue is true when scheduledAt is in the past', () => {
    const pastJob = CallEvaluationJob.enqueue({
      ...baseInput,
      callTimestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
      horizon: EvaluationHorizonVo.H24,
    });
    expect(pastJob.isDue).toBe(true);
  });

  it('markInProgress transitions PENDING → IN_PROGRESS', () => {
    const job = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    job.markInProgress();
    expect(job.status).toBe('IN_PROGRESS');
    expect(job.attempts).toBe(1);
  });

  it('markInProgress throws on non-PENDING job', () => {
    const job = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    job.markInProgress();
    job.markCompleted();
    expect(() => job.markInProgress()).toThrow();
  });

  it('markCompleted sets status + completedAt', () => {
    const job = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    job.markInProgress();
    job.markCompleted();
    expect(job.status).toBe('COMPLETED');
    expect(job.completedAt).not.toBeNull();
    expect(job.isTerminal).toBe(true);
  });

  it('markFailed records error and terminal state', () => {
    const job = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    job.markInProgress();
    job.markFailed('boom');
    expect(job.status).toBe('FAILED');
    expect(job.lastError).toBe('boom');
    expect(job.isTerminal).toBe(true);
  });

  it('isTerminal returns false for PENDING/IN_PROGRESS', () => {
    const pending = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.H24,
    });
    expect(pending.isTerminal).toBe(false);
    const inProgress = CallEvaluationJob.enqueue({
      ...baseInput,
      horizon: EvaluationHorizonVo.D7,
    });
    inProgress.markInProgress();
    expect(inProgress.isTerminal).toBe(false);
  });
});
