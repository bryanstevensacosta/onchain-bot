import { CallMilestoneReachedEvent } from './call-milestone-reached.event';

describe('CallMilestoneReachedEvent', () => {
  const payload = {
    callId: 'solana:ABC',
    chain: 'solana',
    address: 'ABC',
    multiple: 2.5,
    mcAtCall: 10000,
    mcNow: 25000,
    notifiedAt: '2026-06-24T10:00:00.000Z',
  };

  it('uses eventName milestone.call.reached', () => {
    const evt = new CallMilestoneReachedEvent('solana:ABC', payload);
    expect(evt.eventName).toBe('milestone.call.reached');
  });

  it('exposes aggregateId', () => {
    const evt = new CallMilestoneReachedEvent('solana:ABC', payload);
    expect(evt.aggregateId).toBe('solana:ABC');
  });

  it('freezes payload (Object.freeze in constructor)', () => {
    const evt = new CallMilestoneReachedEvent('solana:ABC', payload);
    expect(Object.isFrozen(evt.payload)).toBe(true);
  });

  it('toPayload returns plain object copy', () => {
    const evt = new CallMilestoneReachedEvent('solana:ABC', payload);
    const out = evt.toPayload();
    expect(out).toEqual(payload);
    expect(out).not.toBe(evt.payload);
  });

  it('has eventId and occurredAt from base class', () => {
    const evt = new CallMilestoneReachedEvent('solana:ABC', payload);
    expect(typeof evt.eventId).toBe('string');
    expect(evt.eventId.length).toBeGreaterThan(0);
    expect(evt.occurredAt).toBeInstanceOf(Date);
  });

  it('payload mutations do not affect the event', () => {
    const evt = new CallMilestoneReachedEvent('solana:ABC', payload);
    expect(() => {
      (evt.payload as { multiple: number }).multiple = 999;
    }).toThrow();
  });
});
