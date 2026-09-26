import { DomainError } from '../../../shared/kernel/domain-error';
import { DualSendParityService } from './dual-send-parity.service';

describe('DualSendParityService (gateway todo 4, failing-first)', () => {
  it('records agreement when both legs succeed', () => {
    const svc = new DualSendParityService();
    const rec = svc.record({
      botId: 'b1',
      chatId: '@c',
      direct: { ok: true, messageId: 1, error: null },
      gateway: { ok: true, messageId: 2, error: null },
      chunks: 1,
    });
    expect(rec.diverged).toBe(false);
    expect(svc.snapshot()).toMatchObject({ total: 1, diverged: 0 });
  });

  it('flags ok-mismatch as a divergence (gateway fail vs direct ok)', () => {
    const svc = new DualSendParityService();
    const rec = svc.record({
      botId: 'b1',
      chatId: '@c',
      direct: { ok: true, messageId: 1, error: null },
      gateway: { ok: false, messageId: null, error: 'connect refused' },
      chunks: 1,
    });
    expect(rec.diverged).toBe(true);
    expect(rec.reasons.join(' ')).toContain('ok-mismatch');
    expect(svc.snapshot()).toMatchObject({ total: 1, diverged: 1 });
  });

  it('flags ok-mismatch when direct fails but gateway succeeds', () => {
    const svc = new DualSendParityService();
    svc.record({
      botId: 'b1',
      chatId: '@c',
      direct: { ok: false, messageId: null, error: 'unknown error' },
      gateway: { ok: true, messageId: 9, error: null },
      chunks: 1,
    });
    expect(svc.snapshot().diverged).toBe(1);
  });

  it('blocks cutover while divergences exist (adversarial: divergence -> no cutover)', () => {
    const svc = new DualSendParityService();
    expect(() => svc.assertNoDivergence()).not.toThrow();
    svc.record({
      botId: 'b1',
      chatId: '@c',
      direct: { ok: true, messageId: 1, error: null },
      gateway: { ok: false, messageId: null, error: '429 persisted' },
      chunks: 1,
    });
    let thrown: unknown = null;
    try {
      svc.assertNoDivergence();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
  });
});
