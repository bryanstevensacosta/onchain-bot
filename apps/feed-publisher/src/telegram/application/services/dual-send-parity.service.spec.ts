import { DualSendParityService } from './dual-send-parity.service';

describe('DualSendParityService', () => {
  it('compares outcome-only: messageIds never diverge a record', () => {
    const { diverged } = DualSendParityService.compare(
      { ok: true, messageId: 11, error: null },
      { ok: true, messageId: 777, error: null },
    );
    expect(diverged).toBe(false);
  });

  it('flags ok-mismatches as diverged with reasons', () => {
    const record = new DualSendParityService().record({
      botId: 'vault-1',
      chatId: '@c',
      direct: { ok: true, messageId: 11, error: null },
      gateway: { ok: false, messageId: null, error: 'boom' },
      chunks: 1,
    });
    expect(record.diverged).toBe(true);
    expect(record.reasons.join(' ')).toContain('ok-mismatch');
  });

  it('assertNoDivergence throws CONFLICT while any divergence is recorded', () => {
    const parity = new DualSendParityService();
    parity.record({
      botId: 'vault-1',
      chatId: '@c',
      direct: { ok: true, messageId: 1, error: null },
      gateway: { ok: true, messageId: 2, error: null },
      chunks: 1,
    });
    expect(() => parity.assertNoDivergence()).not.toThrow();
    parity.record({
      botId: 'vault-1',
      chatId: '@c',
      direct: { ok: true, messageId: 1, error: null },
      gateway: { ok: false, messageId: null, error: 'x' },
      chunks: 1,
    });
    expect(() => parity.assertNoDivergence()).toThrow(
      /cutover blocked until parity is 0/,
    );
    expect(parity.snapshot()).toMatchObject({ total: 2, diverged: 1 });
  });
});
