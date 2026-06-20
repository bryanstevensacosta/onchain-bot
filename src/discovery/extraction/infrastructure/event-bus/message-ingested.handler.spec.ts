import { MessageIngestedHandler } from 'discovery/extraction/infrastructure/event-bus/message-ingested.handler';
import { MessageIngestedEvent } from 'discovery/ingestion/telegram/domain/events/message-ingested.event';

describe('MessageIngestedHandler', () => {
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

  it('calls the use case when text is present', async () => {
    const extract = { execute: jest.fn().mockResolvedValue(undefined) };
    const handler = new MessageIngestedHandler(extract as never);

    const event = new MessageIngestedEvent({
      channelId: 'chan-1',
      username: 'SpyDefi',
      messageId: 42,
      occurredAt: FIXED_DATE,
      text: 'PEPE 0xabcdef0123456789abcdef0123456789abcdef01',
    });

    await handler.handle(event);

    expect(extract.execute).toHaveBeenCalledWith({
      channelId: 'chan-1',
      messageId: 42,
      occurredAt: FIXED_DATE,
      text: 'PEPE 0xabcdef0123456789abcdef0123456789abcdef01',
    });
  });

  it('skips events without text (channel lifecycle events)', async () => {
    const extract = { execute: jest.fn().mockResolvedValue(undefined) };
    const handler = new MessageIngestedHandler(extract as never);

    const event = new MessageIngestedEvent({
      channelId: 'chan-1',
      username: null,
      messageId: 0,
      occurredAt: FIXED_DATE,
      // no text — lifecycle event
    });

    await handler.handle(event);

    expect(extract.execute).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by the use case so event-bus is not blocked', async () => {
    const extract = {
      execute: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const handler = new MessageIngestedHandler(extract as never);

    const event = new MessageIngestedEvent({
      channelId: 'chan-1',
      username: null,
      messageId: 1,
      occurredAt: FIXED_DATE,
      text: 'some text',
    });

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});
