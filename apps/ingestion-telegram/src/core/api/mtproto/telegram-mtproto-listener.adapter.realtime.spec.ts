import {
  TelegramMtprotoListenerAdapter,
  normalizeChannelIdForMatch,
} from './telegram-mtproto-listener.adapter';

function buildAdapter(): {
  adapter: TelegramMtprotoListenerAdapter;
  lastSeenSet: jest.Mock;
  queuePush: jest.Mock;
} {
  const lastSeenSet = jest.fn();
  const adapter = new TelegramMtprotoListenerAdapter(
    { get: jest.fn().mockReturnValue({}) } as never,
    { ensureClient: jest.fn() } as never,
    {
      load: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockReturnValue(-1),
      set: lastSeenSet,
      persist: jest.fn().mockResolvedValue(undefined),
    } as never,
    {} as never,
    { findAllActive: jest.fn().mockResolvedValue([]) } as never,
    {
      transform: jest.fn().mockReturnValue({
        peerId: '-1001358788312',
        id: 101,
        text: 'hello',
        occurredAt: new Date('2026-09-28T00:00:00.000Z'),
        entities: [],
        media: [],
        groupedId: null,
        webpagePreview: null,
      }),
    } as never,
    { extractAndDownload: jest.fn() } as never,
    {
      maxChannels: 50,
      pollIntervalBaseMs: 90_000,
      jitterPercent: 30,
    } as never,
    {
      isAsleep: jest.fn().mockReturnValue(false),
      getNextWakeTime: jest.fn().mockReturnValue(null),
    } as never,
  );
  const queuePush = jest.fn();
  (
    adapter as unknown as { messageQueue: { push: jest.Mock } }
  ).messageQueue.push = queuePush;
  return { adapter, lastSeenSet, queuePush };
}

function realtimeEvent(chatId: unknown): unknown {
  return {
    message: {
      id: 101,
      message: 'hello',
      date: 1759100000,
      getChat: () => Promise.resolve({ id: chatId }),
    },
  };
}

function setSubscribed(
  adapter: TelegramMtprotoListenerAdapter,
  ids: string[],
): void {
  (
    adapter as unknown as { subscribedChannelIds: string[] }
  ).subscribedChannelIds = [...ids];
}

function handleEvent(
  adapter: TelegramMtprotoListenerAdapter,
  event: unknown,
): Promise<void> {
  return (
    adapter as unknown as {
      handleEvent: (event: unknown) => Promise<void>;
    }
  ).handleEvent(event);
}

describe('normalizeChannelIdForMatch', () => {
  it('strips the -100 channel prefix', () => {
    expect(normalizeChannelIdForMatch('-1001358788312')).toBe('1358788312');
  });

  it('passes bare ids through unchanged', () => {
    expect(normalizeChannelIdForMatch('1358788312')).toBe('1358788312');
  });

  it('never over-matches: different channels stay different', () => {
    expect(normalizeChannelIdForMatch('-100135878831')).not.toBe(
      normalizeChannelIdForMatch('-1001358788312'),
    );
    expect(normalizeChannelIdForMatch('9999999999')).not.toBe(
      normalizeChannelIdForMatch('-1001358788312'),
    );
  });
});

describe('TelegramMtprotoListenerAdapter realtime channel matching', () => {
  it('matches a bare GramJS chat id against a -100 subscription', async () => {
    const { adapter, lastSeenSet, queuePush } = buildAdapter();
    setSubscribed(adapter, ['-1001358788312']);

    await handleEvent(adapter, realtimeEvent('1358788312'));

    expect(queuePush).toHaveBeenCalledTimes(1);
    expect(lastSeenSet).toHaveBeenCalledWith('-1001358788312', 101);
  });

  it('matches when the event already carries the -100 form', async () => {
    const { adapter, queuePush } = buildAdapter();
    setSubscribed(adapter, ['-1001358788312']);

    await handleEvent(adapter, realtimeEvent('-1001358788312'));

    expect(queuePush).toHaveBeenCalledTimes(1);
  });

  it('rejects non-subscribed channels (no over-match)', async () => {
    const { adapter, lastSeenSet, queuePush } = buildAdapter();
    setSubscribed(adapter, ['-1001358788312']);

    await handleEvent(adapter, realtimeEvent('9999999999'));
    await handleEvent(adapter, realtimeEvent('135878831'));

    expect(queuePush).not.toHaveBeenCalled();
    expect(lastSeenSet).not.toHaveBeenCalled();
  });

  it('drops events with no message or no chat', async () => {
    const { adapter, queuePush } = buildAdapter();
    setSubscribed(adapter, ['-1001358788312']);

    await handleEvent(adapter, {});
    await handleEvent(adapter, { message: { id: 1 } });

    expect(queuePush).not.toHaveBeenCalled();
  });
});
