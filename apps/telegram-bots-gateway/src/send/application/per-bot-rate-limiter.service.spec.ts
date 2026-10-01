import { PerBotRateLimiterService } from './per-bot-rate-limiter.service';

describe('PerBotRateLimiterService (todo 2, red)', () => {
  it('lets a small burst through without waiting', async () => {
    const limiter = new PerBotRateLimiterService({
      botPerSecond: 30,
      perChatPerSecond: 1,
    });
    const start = Date.now();
    await Promise.all([
      limiter.acquire('bot1', 'chat-a'),
      limiter.acquire('bot1', 'chat-b'),
      limiter.acquire('bot1', 'chat-c'),
    ]);
    expect(Date.now() - start).toBeLessThan(900);
  });

  it('paces a second message to the same chat (~1/s per chat)', async () => {
    const limiter = new PerBotRateLimiterService({
      botPerSecond: 30,
      perChatPerSecond: 1,
    });
    await limiter.acquire('bot1', 'chat-same');
    const start = Date.now();
    await limiter.acquire('bot1', 'chat-same');
    expect(Date.now() - start).toBeGreaterThanOrEqual(800);
  });

  it('caps a bot burst at 5/s with small test limits', async () => {
    const limiter = new PerBotRateLimiterService({
      botPerSecond: 5,
      perChatPerSecond: 10,
    });
    const start = Date.now();
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        limiter.acquire('bot-burst', `chat-${i}`),
      ),
    );
    expect(Date.now() - start).toBeGreaterThanOrEqual(800);
  });

  it('isolates quotas per bot (one hot bot does not block another)', async () => {
    const limiter = new PerBotRateLimiterService({
      botPerSecond: 2,
      perChatPerSecond: 10,
    });
    await limiter.acquire('hot-bot', 'chat-1');
    await limiter.acquire('hot-bot', 'chat-2');
    const start = Date.now();
    await limiter.acquire('cold-bot', 'chat-9');
    expect(Date.now() - start).toBeLessThan(900);
  });
});
