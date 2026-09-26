import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { TelegramSendResult } from '../../domain/ports/telegram-send-result';
import { DualSendParityService } from './dual-send-parity.service';

describe('DualSendParityService', () => {
  it('records agreement when the gateway fulfills the plan (0 divergences)', () => {
    const parity = new DualSendParityService();
    const record = parity.record({
      postId: 'sp_01',
      botId: 'vault-1',
      chatId: '-100123',
      shape: 'message',
      plannedOk: true,
      gateway: { ok: true, messageId: 777, error: null },
      chunks: 1,
    });
    expect(record.diverged).toBe(false);
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
    expect(() => parity.assertNoDivergence()).not.toThrow();
  });

  it('records a divergence when the gateway disagrees with the plan', () => {
    const parity = new DualSendParityService();
    parity.record({
      postId: 'sp_02',
      botId: 'vault-1',
      chatId: '-100123',
      shape: 'message',
      plannedOk: true,
      gateway: { ok: false, messageId: null, error: 'TARGET_DOWN' },
      chunks: 1,
    });
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 1 });
    expect(() => parity.assertNoDivergence()).toThrow(/cutover blocked/);
  });

  it('records gateway-incompatible shapes as skipped, never diverged', () => {
    const parity = new DualSendParityService();
    parity.recordSkipped({
      postId: 'sp_03',
      botId: 'vault-1',
      chatId: '-100123',
      shape: 'buttons-or-local-media',
      chunks: 1,
    });
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
    expect(() => parity.assertNoDivergence()).not.toThrow();
  });
});
