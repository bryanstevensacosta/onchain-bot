import { ProcessCryptoNewsMessageHandler } from './process-crypto-news-message.handler';

function frame(
  channelId: string,
  messageId: number,
  messageType = 'crypto-news',
): unknown {
  return {
    type: 'message:telegram',
    data: { peerId: channelId, messageId, messageType },
  };
}

describe('ProcessCryptoNewsMessageHandler', () => {
  it('accepts a crypto-news frame as a new row', () => {
    const handler = new ProcessCryptoNewsMessageHandler();
    expect(handler.handle(frame('-1001', 1))).toBe(true);
    expect(handler.processed).toHaveLength(1);
    expect(handler.processed[0]).toMatchObject({
      channelId: '-1001',
      messageId: 1,
    });
  });

  it('collapses double delivery to a single row', () => {
    const handler = new ProcessCryptoNewsMessageHandler();
    expect(handler.handle(frame('-1001', 1))).toBe(true);
    expect(handler.handle(frame('-1001', 1))).toBe(false);
    expect(handler.processed).toHaveLength(1);
  });

  it('ignores frames without the crypto-news marker (no throw)', () => {
    const handler = new ProcessCryptoNewsMessageHandler();
    expect(handler.handle(frame('-1001', 2, 'digest'))).toBe(false);
    expect(handler.handle({ type: 'health:ping' })).toBe(false);
    expect(handler.processed).toHaveLength(0);
  });
});
