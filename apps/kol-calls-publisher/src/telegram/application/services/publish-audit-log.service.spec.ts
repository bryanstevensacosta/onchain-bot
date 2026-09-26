import { PublishAuditLogService } from './publish-audit-log.service';

describe('PublishAuditLogService (todo 23, P50, failing-first)', () => {
  it('records who/what/where without tokens', () => {
    const audit = new PublishAuditLogService();
    const entry = audit.record({
      actor: 'owner-a',
      action: 'publish',
      templateId: 'tpl-1',
      mentionId: 'solana:ABC:k1:1:0',
      channelTarget: '@mirror',
      reason: null,
    });
    expect(entry.actor).toBe('owner-a');
    expect(entry.templateId).toBe('tpl-1');
    expect(entry.at).toContain('T');
    const keys = Object.keys(entry).sort();
    expect(keys).toEqual(
      [
        'action',
        'actor',
        'at',
        'channelTarget',
        'mentionId',
        'reason',
        'templateId',
      ].sort(),
    );
    expect(JSON.stringify(entry).toLowerCase()).not.toContain('bottoken');
    expect(JSON.stringify(entry)).not.toContain('x-api-key');
  });

  it('lists recent entries newest-first with a limit', () => {
    const audit = new PublishAuditLogService();
    audit.record({
      actor: 'a',
      action: 'blocked',
      templateId: 't',
      reason: 'CHANNEL_NOT_VERIFIED',
    });
    audit.record({
      actor: 'evil',
      action: 'denied',
      templateId: 't',
      reason: 'FOREIGN_BINDING',
    });
    const recent = audit.findRecent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].action).toBe('denied');
    expect(audit.findRecent(1)).toHaveLength(1);
    expect(audit.count()).toBe(2);
  });
});
