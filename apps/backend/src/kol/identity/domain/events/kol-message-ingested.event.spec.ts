import { KolMessageIngestedEvent } from './kol-message-ingested.event';

/**
 * Item 7 (Q1-B) — backend-internal ToS boundary holds while SSE carries text.
 *
 * `telegram.message.ingested` (the event WsGateway forwards to browsers via
 * EVENT_MAP) MUST NOT contain a `text` key: raw KOL text reaches the pipeline
 * only via the direct SSE-adapter → orchestrator handoff, never via the
 * backend event bus (fix-1). See adr-kol-raw-text.md.
 */
describe('KolMessageIngestedEvent - no-text WS invariant', () => {
  it('should not expose a text key in payload or serialized form', () => {
    const event = new KolMessageIngestedEvent({
      kolId: '-1001234567890',
      handle: 'somekol',
      messageId: 12345,
      occurredAt: new Date('2026-09-22T00:00:00.000Z'),
    });

    expect(event.eventName).toBe('telegram.message.ingested');
    expect(event.payload).not.toHaveProperty('text');
    expect(event.payload).not.toHaveProperty('content');
    expect(event.payload).not.toHaveProperty('rawText');

    const serialized = event.toPayload();
    expect(serialized).not.toHaveProperty('text');
    expect(serialized).not.toHaveProperty('content');
    expect(serialized).not.toHaveProperty('rawText');
    expect(serialized).toEqual({
      kolId: '-1001234567890',
      handle: 'somekol',
      messageId: 12345,
      occurredAt: '2026-09-22T00:00:00.000Z',
    });
  });
});
