import { FloodWaitCounterService } from './flood-wait-counter.service';
import { FloodWaitHandlerService } from './flood-wait-handler.service';
import { IngestionSafetyConfig } from '../config/ingestion-safety.config';

function floodError(): Error {
  const err = new Error('FLOOD_WAIT_0') as Error & { seconds: number };
  err.seconds = 0;
  return err;
}

function buildHandler(
  counter: FloodWaitCounterService,
  overrides?: Partial<IngestionSafetyConfig>,
): FloodWaitHandlerService {
  const config = {
    floodMaxAttempts: 3,
    floodInitialMs: 1,
    floodMultiplier: 2,
    floodMaxMs: 5,
    ...overrides,
  } as IngestionSafetyConfig;
  return new FloodWaitHandlerService(config, counter);
}

describe('FloodWaitCounterService consecutive failures (gap 8)', () => {
  it('should start at 0 consecutive failures', () => {
    const counter = new FloodWaitCounterService();
    expect(counter.getConsecutiveFailures()).toBe(0);
  });

  it('should increment consecutive failures on each record', () => {
    const counter = new FloodWaitCounterService();
    counter.record(5);
    counter.record(10);
    expect(counter.getConsecutiveFailures()).toBe(2);
    expect(counter.count24h).toBe(2);
  });

  it('should reset the streak on success without clearing the 24h window', () => {
    const counter = new FloodWaitCounterService();
    counter.record(5);
    counter.record(10);
    counter.recordSuccess();
    expect(counter.getConsecutiveFailures()).toBe(0);
    expect(counter.count24h).toBe(2);
  });

  it('should clear both streak and window on reset', () => {
    const counter = new FloodWaitCounterService();
    counter.record(5);
    counter.reset();
    expect(counter.getConsecutiveFailures()).toBe(0);
    expect(counter.count24h).toBe(0);
  });
});

describe('FloodWaitHandlerService counter wiring (gap 8)', () => {
  it('should reset the counter streak after a successful call', async () => {
    const counter = new FloodWaitCounterService();
    const handler = buildHandler(counter);
    counter.record(5);
    expect(counter.getConsecutiveFailures()).toBe(1);

    await handler.withRetry('test', () => Promise.resolve('ok'));

    expect(counter.getConsecutiveFailures()).toBe(0);
    expect(handler.getConsecutiveFailures()).toBe(0);
  });

  it('should keep the counter streak in sync after exhausting attempts', async () => {
    const counter = new FloodWaitCounterService();
    const handler = buildHandler(counter, { floodMaxAttempts: 2 });

    await expect(
      handler.withRetry('test', () => Promise.reject(floodError())),
    ).rejects.toBeDefined();

    expect(counter.count24h).toBe(2);
    expect(counter.getConsecutiveFailures()).toBe(2);
    expect(handler.getConsecutiveFailures()).toBe(2);
  });

  it('should not touch the counter on non-flood errors', async () => {
    const counter = new FloodWaitCounterService();
    const handler = buildHandler(counter);

    await expect(
      handler.withRetry('test', () =>
        Promise.reject(new Error('Could not find the input entity')),
      ),
    ).rejects.toThrow('Could not find the input entity');

    expect(counter.count24h).toBe(0);
    expect(counter.getConsecutiveFailures()).toBe(0);
  });

  it('should reset the counter streak on resetPause', async () => {
    const counter = new FloodWaitCounterService();
    const handler = buildHandler(counter, { floodMaxAttempts: 1 });

    await expect(
      handler.withRetry('test', () => Promise.reject(floodError())),
    ).rejects.toBeDefined();
    expect(counter.getConsecutiveFailures()).toBe(1);

    handler.resetPause();

    expect(counter.getConsecutiveFailures()).toBe(0);
    expect(handler.getConsecutiveFailures()).toBe(0);
  });
});
