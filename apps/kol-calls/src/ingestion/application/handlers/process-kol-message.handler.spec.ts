import { ProcessKolMessageHandler } from './process-kol-message.handler';

function kolFrame(peerId = '-100123', messageId = 7): unknown {
  return {
    type: 'message:telegram',
    data: {
      peerId,
      messageId,
      occurredAt: '2026-09-24T00:00:00.000Z',
      text: 'SOL Ca ABC…',
      messageType: 'kol',
    },
  };
}

describe('ProcessKolMessageHandler', () => {
  it('accepts a kol message frame', () => {
    const handler = new ProcessKolMessageHandler();
    expect(handler.handle(kolFrame())).toBe(true);
    expect(handler.processed).toHaveLength(1);
    expect(handler.processed[0]).toMatchObject({
      channelId: '-100123',
      messageId: 7,
    });
  });

  it('ignores a crypto-news frame via negative assert', () => {
    const handler = new ProcessKolMessageHandler();
    const frame = {
      type: 'message:telegram',
      data: {
        peerId: '-100123',
        messageId: 8,
        occurredAt: '2026-09-24T00:00:00.000Z',
        text: 'market update',
        messageType: 'crypto-news',
      },
    };
    expect(handler.handle(frame)).toBe(false);
    expect(handler.processed).toHaveLength(0);
  });

  it('collapses double-delivery (realtime + catch-up) into a single row', () => {
    const handler = new ProcessKolMessageHandler();
    const frame = kolFrame('-100123', 9);
    expect(handler.handle(frame)).toBe(true);
    expect(handler.handle(frame)).toBe(false);
    expect(handler.processed).toHaveLength(1);
  });

  it('ignores a malformed frame with no data.messageType without crashing', () => {
    const handler = new ProcessKolMessageHandler();
    expect(handler.handle({ type: 'message:telegram', data: {} })).toBe(false);
    expect(handler.handle({ type: 'message:telegram' })).toBe(false);
    expect(handler.handle(null)).toBe(false);
    expect(handler.handle('garbage')).toBe(false);
    expect(handler.processed).toHaveLength(0);
  });
});
