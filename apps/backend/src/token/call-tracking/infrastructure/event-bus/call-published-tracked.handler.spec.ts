import { CallPublishedTrackedHandler } from './call-published-tracked.handler';
import {
  TrackPublishedCallUseCase,
  TrackPublishedCallInput,
  TrackPublishedCallResult,
} from '../../application/handlers/track-published-call.use-case';
import { CallPublishedEvent } from 'telegram/shared/domain/events/call-published.event';

describe('CallPublishedTrackedHandler', () => {
  it('subscribes to publishing.telegram.published and delegates to use case', async () => {
    const executeMock = jest
      .fn<Promise<TrackPublishedCallResult>, [TrackPublishedCallInput]>()
      .mockResolvedValue({ created: true, trackedId: 'sol:abc' });
    const trackUseCase = {
      execute: executeMock,
    } as unknown as TrackPublishedCallUseCase;
    const handler = new CallPublishedTrackedHandler(trackUseCase);
    const event = new CallPublishedEvent({
      chain: 'solana',
      address: 'ABC',
      ticker: 'WIF',
      score: 80,
      tier: 'STRONG',
      classification: 'LEGITIMATE',
      publishedChannelIds: ['kol_spydefi'],
      publishedAt: new Date('2026-06-24T10:00:00Z'),
    });

    await handler.handle(event);

    expect(executeMock).toHaveBeenCalledWith({
      chain: 'solana',
      address: 'ABC',
      ticker: 'WIF',
      publishedAt: new Date('2026-06-24T10:00:00Z'),
      kolId: 'kol_spydefi',
    });
  });

  it('uses null kolId when publishedChannelIds is empty', async () => {
    const executeMock = jest
      .fn<Promise<TrackPublishedCallResult>, [TrackPublishedCallInput]>()
      .mockResolvedValue({ created: true, trackedId: 'sol:abc' });
    const trackUseCase = {
      execute: executeMock,
    } as unknown as TrackPublishedCallUseCase;
    const handler = new CallPublishedTrackedHandler(trackUseCase);
    const event = new CallPublishedEvent({
      chain: 'solana',
      address: 'ABC',
      ticker: null,
      score: 50,
      tier: 'NEUTRAL',
      classification: 'UNKNOWN',
      publishedChannelIds: [],
      publishedAt: new Date('2026-06-24T10:00:00Z'),
    });
    await handler.handle(event);
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({ kolId: null }),
    );
  });

  it('does not throw when use case fails (logs and swallows)', async () => {
    const executeMock = jest
      .fn<Promise<TrackPublishedCallResult>, [TrackPublishedCallInput]>()
      .mockRejectedValue(new Error('boom'));
    const trackUseCase = {
      execute: executeMock,
    } as unknown as TrackPublishedCallUseCase;
    const handler = new CallPublishedTrackedHandler(trackUseCase);
    const event = new CallPublishedEvent({
      chain: 'solana',
      address: 'ABC',
      ticker: 'WIF',
      score: 50,
      tier: 'NEUTRAL',
      classification: 'UNKNOWN',
      publishedChannelIds: ['kol_spydefi'],
      publishedAt: new Date(),
    });
    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});
