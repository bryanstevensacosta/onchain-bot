import { CallApproval } from './call-approval.entity';

describe('CallApproval entity (todo 11, failing-first)', () => {
  it('creates pending with id templateId:mentionId', () => {
    const approval = CallApproval.create({
      templateId: 'vip-calls',
      mentionId: 'solana:ABC:k1:1:0',
      kolId: 'k1',
      chain: 'solana',
      address: 'ABC',
      ticker: 'BONK',
      score: 82,
    });
    expect(approval.id).toBe('vip-calls:solana:ABC:k1:1:0');
    expect(approval.status).toBe('pending');
    expect(approval.decidedAt).toBeNull();
  });

  it('approve transitions pending -> approved with event', () => {
    const approval = CallApproval.create({
      templateId: 'vip-calls',
      mentionId: 'm1',
      kolId: 'k1',
      chain: 'solana',
      address: 'ABC',
      ticker: 'BONK',
      score: 82,
    });
    approval.approve('manual');
    expect(approval.status).toBe('approved');
    expect(approval.decidedBy).toBe('manual');
    expect(approval.decidedAt).not.toBeNull();
    const events = approval.commit();
    expect(events.map((e) => e.eventName)).toContain('approval.call.decided');
  });

  it('reject records the reason', () => {
    const approval = CallApproval.create({
      templateId: 'vip-calls',
      mentionId: 'm1',
      kolId: 'k1',
      chain: 'solana',
      address: 'ABC',
      ticker: null,
      score: 10,
    });
    approval.reject('SCORE_BELOW_FLOOR');
    expect(approval.status).toBe('rejected');
    expect(approval.reason).toBe('SCORE_BELOW_FLOOR');
  });

  it('double decision throws', () => {
    const approval = CallApproval.create({
      templateId: 'vip-calls',
      mentionId: 'm1',
      kolId: 'k1',
      chain: 'solana',
      address: 'ABC',
      ticker: 'BONK',
      score: 82,
    });
    approval.approve();
    expect(() => approval.approve()).toThrow();
    expect(() => approval.reject('X')).toThrow();
  });

  it('empty ids throw', () => {
    expect(() =>
      CallApproval.create({
        templateId: '',
        mentionId: 'm1',
        kolId: 'k1',
        chain: 'solana',
        address: 'ABC',
        ticker: 'BONK',
        score: 82,
      }),
    ).toThrow();
  });
});
