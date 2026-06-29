import { RegisterCallForMilestonesEvent } from './register-call-for-milestones.event';

describe('RegisterCallForMilestonesEvent', () => {
  const payload = {
    callId: 'solana:ABC',
    chain: 'solana',
    address: 'ABC',
    mcAtCall: 10000,
    publishedAt: '2026-06-24T10:00:00.000Z',
  };

  it('uses eventName milestone.register.call', () => {
    const evt = new RegisterCallForMilestonesEvent('solana:ABC', payload);
    expect(evt.eventName).toBe('milestone.register.call');
  });

  it('exposes aggregateId', () => {
    const evt = new RegisterCallForMilestonesEvent('solana:ABC', payload);
    expect(evt.aggregateId).toBe('solana:ABC');
  });

  it('freezes payload (Object.freeze in constructor)', () => {
    const evt = new RegisterCallForMilestonesEvent('solana:ABC', payload);
    expect(Object.isFrozen(evt.payload)).toBe(true);
  });

  it('toPayload returns plain object copy', () => {
    const evt = new RegisterCallForMilestonesEvent('solana:ABC', payload);
    const out = evt.toPayload();
    expect(out).toEqual(payload);
    expect(out).not.toBe(evt.payload);
  });

  it('has eventId and occurredAt from base class', () => {
    const evt = new RegisterCallForMilestonesEvent('solana:ABC', payload);
    expect(typeof evt.eventId).toBe('string');
    expect(evt.occurredAt).toBeInstanceOf(Date);
  });
});
