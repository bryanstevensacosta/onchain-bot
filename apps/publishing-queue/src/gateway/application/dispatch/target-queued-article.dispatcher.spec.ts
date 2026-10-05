import { ConfigService } from '@nestjs/config';
import { TargetQueuedArticleDispatcher } from './target-queued-article.dispatcher';
import type { TargetDispatcherPort } from '../ports/target-dispatcher.port';
import { PublisherQueueEntry } from '@/queue/domain/publisher-queue-entry.entity';

function entry(contentType: string): PublisherQueueEntry {
  return PublisherQueueEntry.create({
    id: 'q-1',
    contentType,
    channelId: '-1001',
    messageId: 9,
    rawContent: 'raw',
    matchedKeywordIds: ['k1'],
  });
}

function config(): ConfigService {
  return {
    get: (key: string): string =>
      key === 'THREADS_OUTPUT_CHANNEL' ? '@digest' : '@news',
  } as ConfigService;
}

describe('TargetQueuedArticleDispatcher (todo 10)', () => {
  it('routes crypto-news entries to the telegram target', async () => {
    const dispatch = jest
      .fn()
      .mockResolvedValue({ ok: true, remoteId: 'tg-1' });
    const dispatcher = new TargetQueuedArticleDispatcher(config(), {
      dispatch,
    });
    const result = await dispatcher.dispatch(entry('crypto-news'), 'hello');
    expect(result).toEqual({ telegramMessageId: 'tg-1' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'telegram',
        botId: 'env:CRYPTO_NEWS_BOT_TOKEN',
        chatId: '@news',
        content: 'hello',
      }),
    );
  });

  it('throws not-configured when the target dispatcher is unwired', async () => {
    const dispatcher = new TargetQueuedArticleDispatcher(config(), undefined);
    await expect(
      dispatcher.dispatch(entry('crypto-news'), 'hello'),
    ).rejects.toThrow('not configured');
  });

  it('throws not-configured when no channel resolves', async () => {
    const empty = { get: (): string => '' } as ConfigService;
    const dispatch = jest.fn();
    const dispatcher = new TargetQueuedArticleDispatcher(empty, {
      dispatch,
    });
    await expect(
      dispatcher.dispatch(entry('crypto-news'), 'hello'),
    ).rejects.toThrow('not configured');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('routes threads entries to the threads target', async () => {
    const dispatch = jest
      .fn()
      .mockResolvedValue({ ok: true, remoteId: 'th-9' });
    const dispatcher = new TargetQueuedArticleDispatcher(config(), {
      dispatch,
    });
    const result = await dispatcher.dispatch(entry('threads'), 'hello');
    expect(result).toEqual({ telegramMessageId: 'th-9' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'threads' }),
    );
  });
});
