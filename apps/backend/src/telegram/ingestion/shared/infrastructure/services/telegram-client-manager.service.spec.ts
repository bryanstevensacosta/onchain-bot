/**
 * TelegramClientManager spec — Todo 2 of plan `.omo/plans/fix-mtproto-listener-wedge.md`.
 *
 * Verifies that `ensureClient()` honors:
 *   - `cfg.telegram.mtprotoLogLevel` → gramJS `LogLevel` mapped into `baseLogger._logLevel`
 *   - `cfg.telegram.mtprotoUseWss` → passed into the TelegramClient constructor params
 *
 * Verifies that `connect()` honors:
 *   - `cfg.telegram.mtprotoStartupDelayMs` → sleep before `client.connect()`
 *
 * Mocking notes
 * -------------
 * Jest's `moduleNameMapper` rewrites `telegram/...` to `<rootDir>/src/telegram/...`,
 * so we cannot `import { TelegramClient } from 'telegram'` (it resolves to nothing
 * local). Instead we load the service via `require()` AFTER installing a
 * `jest.mock('telegram', ...)` factory. The factory exposes a `TelegramClient`
 * spy (records constructor args), a `Logger` fake (records constructed level),
 * and the `LogLevel` enum as string values — gramJS's actual shape
 * (`LogLevel.NONE = "none"` … `LogLevel.DEBUG = "debug"`, see
 * node_modules/telegram/extensions/Logger.d.ts). If gramJS changes its
 * `LogLevel` value shape to numeric in a future version, the assertions
 * here should be updated to match.
 */
import { ConfigService } from '@nestjs/config';

// --- Mock the `telegram` npm package BEFORE the service module is loaded. ---
// The service file does `import { TelegramClient } from 'telegram'` +
// `import { Logger as GramjsLogger, LogLevel } from 'telegram/extensions/Logger'`.
// The Jest moduleNameMapper rewrites `telegram/extensions/Logger` to a local
// path (which does not exist for the package subpath), so we mock BOTH with
// one factory that exposes everything the service file pulls in.

const telegramClientInstances: Array<{
  self: { connectCalls: number };
  session: unknown;
  apiId: number;
  apiHash: string;
  params: Record<string, unknown>;
}> = [];

const loggerInstances: Array<{ level: string }> = [];

const mockLogLevel = {
  NONE: 'none',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

jest.mock(
  'telegram',
  () => {
    class TelegramClient {
      public connectCalls = 0;

      public constructor(
        session: any,
        apiId: number,
        apiHash: string,
        params: any,
      ) {
        telegramClientInstances.push({
          self: this,
          session,
          apiId,
          apiHash,
          params,
        });
      }
      public async connect(): Promise<void> {
        this.connectCalls += 1;
      }
      public async disconnect(): Promise<void> {
        /* noop */
      }
      public async isUserAuthorized(): Promise<boolean> {
        return true;
      }
    }
    class Logger {
      public _logLevel: string;

      public constructor(level?: any) {
        const lvl = typeof level === 'string' ? level : mockLogLevel.ERROR;
        loggerInstances.push({ level: lvl });
        this._logLevel = lvl;
      }
      public setLevel(level: string): void {
        this._logLevel = level;
      }
      public get logLevel(): string {
        return this._logLevel;
      }
    }
    return {
      TelegramClient,
      LogLevel: mockLogLevel,
      Logger,
    };
  },
  { virtual: true },
);

// The shim at `src/telegram/extensions/Logger.ts` re-exports the real
// gramJS Logger from `node_modules/telegram/extensions/Logger`. We mock
// the absolute path the shim loads from, so every `new GramjsLogger(...)`
// in the service file uses our spy instead of the real class.
jest.mock(
  '/Users/bryanstevens/dev/onchain-bot/node_modules/telegram/extensions/Logger',
  () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- resolves to the virtual mock above
    const { Logger, LogLevel } = require('telegram');
    return { Logger, LogLevel };
  },
  { virtual: true },
);

// --- Load the service under test lazily (see comment block above). ---

const { TelegramClientManager } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- static imports trip the `telegram/extensions/Logger` Jest mapping; require() bypasses it
  require('./telegram-client-manager.service') as {
    TelegramClientManager: new (config: ConfigService) => {
      ensureClient(): unknown;
      connect(): Promise<void>;
      disconnect(): Promise<void>;
      getClient(): unknown;
    };
  };

// --- Helpers ---

function makeConfig(
  telegram: Partial<{
    mtprotoApiId: number;
    mtprotoApiHash: string;
    mtprotoSession: string;
    mtprotoLogLevel: string;
    mtprotoStartupDelayMs: number;
    mtprotoUseWss: boolean;
  }>,
): ConfigService {
  const fullTelegram = {
    botToken: '',
    mtprotoApiId: 12345,
    mtprotoApiHash: 'abcd',
    mtprotoSession: '',
    mtprotoLogLevel: 'error',
    mtprotoStartupDelayMs: 0,
    mtprotoUseWss: false,
    ...telegram,
  };
  const cfg = { telegram: fullTelegram } as never;
  return {
    get: (key: string) => (key === 'app' ? cfg : undefined),
  } as unknown as ConfigService;
}

/**
 * Find the Logger instance that was constructed for the most recent
 * TelegramClient (via the baseLogger param). We track them in lock-step
 * via `loggerInstances` / `telegramClientInstances`.
 */
function lastBaseLoggerLevel(): string {
  // TelegramClient construction pushes 1 entry, then its `baseLogger`
  // (a Logger instance) was pushed during ensureClient BEFORE the ctor —
  // so the last Logger is the one paired with the last client.
  const lastLogger = loggerInstances[loggerInstances.length - 1];
  return lastLogger.level;
}

function lastClientParams(): Record<string, unknown> {
  const lastClient =
    telegramClientInstances[telegramClientInstances.length - 1];
  return lastClient.params;
}

// --- Lifecycle: reset spies between tests ---

beforeEach(() => {
  telegramClientInstances.length = 0;
  loggerInstances.length = 0;
  jest.restoreAllMocks();
});

// ============================================================
// ensureClient — log level mapping
// ============================================================

describe('TelegramClientManager.ensureClient — mtprotoLogLevel', () => {
  it('maps "debug" → baseLogger level "debug"', () => {
    const mgr = new TelegramClientManager(
      makeConfig({ mtprotoLogLevel: 'debug' }),
    );
    mgr.ensureClient();
    expect(lastBaseLoggerLevel()).toBe('debug');
  });

  it('maps "error" → baseLogger level "error"', () => {
    const mgr = new TelegramClientManager(
      makeConfig({ mtprotoLogLevel: 'error' }),
    );
    mgr.ensureClient();
    expect(lastBaseLoggerLevel()).toBe('error');
  });

  it('maps "none" → baseLogger level "none"', () => {
    const mgr = new TelegramClientManager(
      makeConfig({ mtprotoLogLevel: 'none' }),
    );
    mgr.ensureClient();
    expect(lastBaseLoggerLevel()).toBe('none');
  });

  it('falls back to "error" for unknown logLevel values (defensive)', () => {
    const mgr = new TelegramClientManager(
      makeConfig({ mtprotoLogLevel: 'unknown-thing' }),
    );
    mgr.ensureClient();
    expect(lastBaseLoggerLevel()).toBe('error');
  });
});

// ============================================================
// ensureClient — useWSS
// ============================================================

describe('TelegramClientManager.ensureClient — mtprotoUseWss', () => {
  it('passes useWSS: true into the TelegramClient constructor when configured', () => {
    const mgr = new TelegramClientManager(makeConfig({ mtprotoUseWss: true }));
    mgr.ensureClient();
    expect(lastClientParams()).toMatchObject({ useWSS: true });
  });

  it('passes useWSS: false (default) into the TelegramClient constructor', () => {
    const mgr = new TelegramClientManager(makeConfig({ mtprotoUseWss: false }));
    mgr.ensureClient();
    expect(lastClientParams()).toMatchObject({ useWSS: false });
  });
});

// ============================================================
// connect — startup delay
// ============================================================

describe('TelegramClientManager.connect — mtprotoStartupDelayMs', () => {
  it('skips the delay when mtprotoStartupDelayMs <= 0', async () => {
    const mgr = new TelegramClientManager(
      makeConfig({ mtprotoStartupDelayMs: 0 }),
    );
    mgr.ensureClient();
    const entry = telegramClientInstances[telegramClientInstances.length - 1];
    expect(entry).toBeDefined();
    const connectCallsBefore = entry.self.connectCalls;
    const p = mgr.connect();
    // No delay → promise should resolve on next microtask flush.
    await Promise.resolve();
    await Promise.resolve();
    await p;
    expect(entry.self.connectCalls).toBe(connectCallsBefore + 1);
  });

  it('skips the delay when mtprotoStartupDelayMs is negative', async () => {
    const mgr = new TelegramClientManager(
      makeConfig({ mtprotoStartupDelayMs: -1 }),
    );
    mgr.ensureClient();
    const entry = telegramClientInstances[telegramClientInstances.length - 1];
    const p = mgr.connect();
    await Promise.resolve();
    await Promise.resolve();
    await p;
    expect(entry.self.connectCalls).toBe(1);
  });

  it('delays client.connect() by mtprotoStartupDelayMs when > 0', async () => {
    jest.useFakeTimers();
    try {
      const mgr = new TelegramClientManager(
        makeConfig({ mtprotoStartupDelayMs: 60_000 }),
      );
      mgr.ensureClient();
      const entry = telegramClientInstances[telegramClientInstances.length - 1];
      expect(entry.self.connectCalls).toBe(0);

      const p = mgr.connect();
      // Flush microtasks a few times — the sleep promise must NOT have
      // resolved yet because 60_000ms have not elapsed.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(entry.self.connectCalls).toBe(0);

      // Advance time, then flush microtasks so the awaited sleep resolves
      // and the subsequent client.connect() runs.
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      await p;
      expect(entry.self.connectCalls).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
