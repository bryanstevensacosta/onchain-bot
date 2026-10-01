import { ConflictException } from '@nestjs/common';
import { DualSendParityService } from './dual-send-parity.service';

const DIRECT_OK = { ok: true, messageId: 11, error: null };
const GATEWAY_OK = { ok: true, messageId: 77, error: null };

describe('DualSendParityService (dexter gateway todo 6)', () => {
  it('agrees when both legs share the outcome (messageIds ignored)', () => {
    const service = new DualSendParityService();
    const record = service.record({
      botId: 'vault-1',
      chatId: '42',
      shape: 'message',
      direct: DIRECT_OK,
      gateway: GATEWAY_OK,
      chunks: 1,
    });
    expect(record.diverged).toBe(false);
    expect(service.snapshot()).toMatchObject({ total: 1, diverged: 0 });
    expect(() => service.assertNoDivergence()).not.toThrow();
  });

  it('diverges on ok-mismatch and blocks cutover', () => {
    const service = new DualSendParityService();
    service.record({
      botId: 'vault-1',
      chatId: '42',
      shape: 'message',
      direct: DIRECT_OK,
      gateway: { ok: false, messageId: null, error: 'Unauthorized' },
      chunks: 1,
    });
    expect(service.snapshot()).toMatchObject({ total: 1, diverged: 1 });
    expect(() => service.assertNoDivergence()).toThrow(ConflictException);
  });

  it('records keyboard legs as skipped, never diverged', () => {
    const service = new DualSendParityService();
    service.recordSkipped({
      botId: 'vault-1',
      chatId: '42',
      shape: 'keyboard',
      chunks: 1,
    });
    service.recordSkipped({
      botId: 'vault-1',
      chatId: '42',
      shape: 'callback-query',
      chunks: 0,
    });
    const snap = service.snapshot();
    expect(snap).toMatchObject({ total: 2, diverged: 0 });
    expect(() => service.assertNoDivergence()).not.toThrow();
  });
});
