import { PublishAuditLog } from './publish-audit-log.service';

describe('PublishAuditLog (todo 14, P50)', () => {
  it('appends publish attempts with sequence order and no token material', () => {
    const audit = new PublishAuditLog();
    const first = audit.append({
      sessionId: 'tab-news',
      target: 'telegram',
      botId: 'tg-1',
      chatId: '@news',
      mode: 'llm',
      result: 'published',
    });
    const second = audit.append({
      sessionId: 'tab-news',
      target: 'telegram',
      botId: 'tg-1',
      chatId: '@evil',
      mode: 'llm',
      result: 'blocked',
      reason: 'foreign channel',
    });
    expect(second.seq).toBe(first.seq + 1);
    expect(audit.list()).toHaveLength(2);
    const serialized = JSON.stringify(audit.list());
    expect(serialized).not.toMatch(/token|ciphertext|iv:tag:data/i);
    expect(Object.keys(second).sort()).toEqual(
      [
        'seq',
        'at',
        'sessionId',
        'target',
        'botId',
        'chatId',
        'mode',
        'result',
        'reason',
      ].sort(),
    );
  });
});
