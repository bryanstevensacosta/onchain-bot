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
 *
 * Why we mock the SHIM path (not the absolute `node_modules/...` path):
 *   The service file does `import ... from 'telegram/extensions/Logger'`,
 *   which Jest's `^telegram/(.*)$` moduleNameMapper rewrites to the local
 *   shim file `src/telegram/extensions/Logger.ts`. That shim re-exports from
 *   a hardcoded absolute `node_modules` path, which works in production but
 *   breaks portability across machines (the absolute path differs in CI vs
 *   local). Mocking the shim path directly via the SAME moduleNameMapper
 *   rewriting keeps the spec portable: any environment that resolves
 *   `telegram/extensions/Logger` will hit our spy.
 */
import { ConfigService } from '@nestjs/config';

// --- Mock the `telegram` npm package BEFORE the service module is loaded. ---
// The service file does `import { TelegramClient } from 'telegram'` +
// `import { Logger as GramjsLogger, LogLevel } from 'telegram/extensions/Logger`.
// The Jest moduleNameMapper rewrites `telegram/extensions/Logger` to the local
// shim at `<rootDir>/src/telegram/extensions/Logger`. We mock BOTH the parent
// (`telegram`) AND the shim path (which is what the service actually loads via
// the mapper) with one shared factory so that `new GramjsLogger(...)` always
// uses our spy regardless of which resolution path Jest takes.

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

// Mock the shim resolution path that Jest's moduleNameMapper rewrites
// `telegram/extensions/Logger` into. We deliberately use the SAME string the
// mapper rewrites to (the shim file) so that any host resolving
// `telegram/extensions/Logger` ends up in our factory — no hardcoded absolute
// path that breaks when the repo is checked out elsewhere (CI vs local).
jest.mock(
  'telegram/extensions/Logger',
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
      markAuthorizedIfTrue(): Promise<void>;
      isAuthorized(): boolean;
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
 *
 * Defensive: returns `undefined` (rather than throwing `TypeError: Cannot
 * read properties of undefined (reading 'level')`) when no Logger was ever
 * constructed. This guards against test-ordering / mock-resolution
 * regressions where the Logger spy is bypassed (e.g. on CI when a
 * hardcoded absolute-path jest.mock key fails to match the runner's
 * checked-out path and the real gramJS Logger takes over). Failing tests
 * then surface the empty `loggerInstances` array as a clear signal
 * instead of a cryptic TypeError on `.level`.
 */
function lastBaseLoggerLevel(): string | undefined {
  // TelegramClient construction pushes 1 entry, then its `baseLogger`
  // (a Logger instance) was pushed during ensureClient BEFORE the ctor —
  // so the last Logger is the one paired with the last client.
  const lastLogger = loggerInstances[loggerInstances.length - 1];
  return lastLogger?.level;
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

// ============================================================
// markAuthorizedIfTrue — 20s timeout race so bootstrap never hangs
// ============================================================
//
// The listener adapter (telegram-mtproto-listener.adapter.ts:73-77) calls
// `markAuthorizedIfTrue()` from `onModuleInit`. If the gramJS connect() ever
// hangs (e.g. silent AUTH_KEY_DUPLICATED), the entire NestJS bootstrap stalls
// and :3030 never binds. The fix wraps the connect() + isUserAuthorized()
// sequence in a Promise.race with a 20_000ms timeout.
//
// IMPORTANT ORDERING:
//   1. ensureClient() (sync) → constructs TelegramClient
//   2. connect() (async) — Todo 2's 60s startup delay runs HERE,
//      BEFORE the raced operation, OUTSIDE the timeout race.
//   3. markAuthorizedIfTrue() awaits connect(), THEN races
//      `client.isUserAuthorized()` against a 20s timer.
//      Wait — re-reading the code: connect() does the sleep + client.connect().
//      Then markAuthorizedIfTrue awaits connect() (outside the race),
//      then awaits isUserAuthorized() (inside the race).
//      So the race wraps isUserAuthorized() only — but Todo 3's
//      spec says wrap connect()+isUserAuthorized() together.
//      Resolved: per the plan, the timeout race wraps the SEQUENCE
//      connect() + isUserAuthorized() inside markAuthorizedIfTrue.
//      We replace the current `await connect(); await isUserAuthorized()`
//      with a single Promise.race over the two awaits.
//
// Race semantics:
//   - Promise.race resolves/rejects on the FIRST settled promise. So if
//     connect() resolves at exactly the timeout boundary, it wins.
//   - On timeout: log + return (no throw). authorizedAtLeastOnce = false.
//   - On error: log + return (no throw). authorizedAtLeastOnce = false.

describe('TelegramClientManager.markAuthorizedIfTrue — timeout race (Todo 3)', () => {
  beforeEach(() => {
    // Clear the mock instances arrays to avoid state leakage between tests
    telegramClientInstances.length = 0;
    loggerInstances.length = 0;
  });

  function setupManager(): {
    mgr: InstanceType<typeof TelegramClientManager>;
    logger: { log: jest.Mock; error: jest.Mock };
  } {
    const mgr = new TelegramClientManager(
      makeConfig({ mtprotoStartupDelayMs: 0 }),
    );
    mgr.ensureClient();
    const loggerField = (
      mgr as unknown as {
        logger: { log: jest.Mock; error: jest.Mock };
      }
    ).logger;
    const logSpy = jest.spyOn(loggerField, 'log').mockImplementation(() => {});
    const errorSpy = jest
      .spyOn(loggerField, 'error')
      .mockImplementation(() => {});
    return { mgr, logger: { log: logSpy, error: errorSpy } };
  }

  function protoOfLast(): {
    connect: () => Promise<void>;
    isUserAuthorized: () => Promise<boolean>;
  } {
    const entry = telegramClientInstances[telegramClientInstances.length - 1];
    return Object.getPrototypeOf(entry.self) as {
      connect: () => Promise<void>;
      isUserAuthorized: () => Promise<boolean>;
    };
  }

  it('happy path: connect + isUserAuthorized both resolve quickly → authorizedAtLeastOnce=true, no timeout log', async () => {
    const { mgr, logger } = setupManager();
    await mgr.markAuthorizedIfTrue();
    expect(mgr.isAuthorized()).toBe(true);
    const timeoutLogged = logger.log.mock.calls.some((args) =>
      String(args[0] ?? '').includes('MTProto connect timed out'),
    );
    expect(timeoutLogged).toBe(false);
  });

  it('happy path: subsequent calls short-circuit because authorizedAtLeastOnce is already true', async () => {
    const { mgr } = setupManager();
    await mgr.markAuthorizedIfTrue();
    const spy = jest.spyOn(protoOfLast(), 'isUserAuthorized');
    await mgr.markAuthorizedIfTrue();
    expect(spy).not.toHaveBeenCalled();
    expect(mgr.isAuthorized()).toBe(true);
    spy.mockRestore();
  });

  it('timeout: connect() never resolves (hang) → markAuthorizedIfTrue resolves within ~20s fake timer, authorizedAtLeastOnce=false, timeout log captured', async () => {
    jest.useFakeTimers();
    const { mgr, logger } = setupManager();
    const connectSpy = jest
      .spyOn(protoOfLast(), 'connect')
      .mockImplementation(() => new Promise<void>(() => {}));

    try {
      const p = mgr.markAuthorizedIfTrue();
      const guard = p.catch(() => undefined);
      jest.advanceTimersByTime(20_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await p;
      await guard;

      expect(mgr.isAuthorized()).toBe(false);
      const timeoutCall = logger.log.mock.calls.find((args) =>
        String(args[0] ?? '').includes(
          'MTProto connect timed out after 20000ms',
        ),
      );
      expect(timeoutCall).toBeDefined();
      expect(connectSpy).toHaveBeenCalled();
    } finally {
      connectSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('race semantics: connect() resolves before the timer → the resolved promise wins (Promise.race picks first settle)', async () => {
    jest.useFakeTimers();
    const { mgr } = setupManager();
    const connectSpy = jest
      .spyOn(protoOfLast(), 'connect')
      .mockImplementation(() => Promise.resolve());

    try {
      const p = mgr.markAuthorizedIfTrue();
      // Flush microtasks BEFORE advancing fake timers — otherwise the
      // 20s timer (faked) wins the race before op resolves on its
      // microtask.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await p;
      expect(mgr.isAuthorized()).toBe(true);
      expect(connectSpy).toHaveBeenCalledTimes(1);
    } finally {
      connectSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('error path: connect() rejects with AUTH_KEY_DUPLICATED → markAuthorizedIfTrue resolves (no throw), authorizedAtLeastOnce=false, error message logged', async () => {
    const { mgr, logger } = setupManager();
    const connectSpy = jest
      .spyOn(protoOfLast(), 'connect')
      .mockRejectedValue(new Error('AUTH_KEY_DUPLICATED'));

    await expect(mgr.markAuthorizedIfTrue()).resolves.toBeUndefined();
    expect(mgr.isAuthorized()).toBe(false);
    const errCall = logger.error.mock.calls.find((args) =>
      String(args[0] ?? '').includes('AUTH_KEY_DUPLICATED'),
    );
    expect(errCall).toBeDefined();
    connectSpy.mockRestore();
  });

  it('error path: isUserAuthorized() rejects → markAuthorizedIfTrue resolves (no throw), authorizedAtLeastOnce=false, error message logged', async () => {
    const { mgr, logger } = setupManager();
    const authSpy = jest
      .spyOn(protoOfLast(), 'isUserAuthorized')
      .mockRejectedValue(new Error('FLOOD_WAIT_5'));

    await expect(mgr.markAuthorizedIfTrue()).resolves.toBeUndefined();
    expect(mgr.isAuthorized()).toBe(false);
    const errCall = logger.error.mock.calls.find((args) =>
      String(args[0] ?? '').includes('FLOOD_WAIT_5'),
    );
    expect(errCall).toBeDefined();
    authSpy.mockRestore();
  });

  // ============================================================
  // markAuthorizedIfTrue — mtprotoStartupDelayMs must run OUTSIDE the race
  // ============================================================
  //
  // Plan mandate (.omo/plans/fix-mtproto-listener-wedge.md:84):
  //   "the 60s startup delay must NOT run inside this race — delay happens
  //    first, then raced connect".
  //
  // Previous commit (1a057b3) wrapped `await this.connect()` inside the race.
  // `connect()` contains the mtprotoStartupDelayMs sleep BEFORE client.connect().
  // So with delay=60s, the 20s timeout fires DURING the delay, interrupting
  // Todo 2's AUTH_KEY_DUPLICATED prevention (which requires waiting the full
  // 60s before connecting). This deviation MUST be fixed: the delay runs
  // UNBLOCKED first; only client.connect() + isUserAuthorized() are inside
  // the 20s race timer.

  describe('TelegramClientManager.markAuthorizedIfTrue — startup delay OUTSIDE race (T3-fix)', () => {
    /**
     * Helper: build a manager with a non-zero mtprotoStartupDelayMs and
     * the LAST TelegramClient.connect() patched to never resolve.
     */
    function setupManagerWithDelayAndHang(): {
      mgr: InstanceType<typeof TelegramClientManager>;
      logger: { log: jest.Mock; error: jest.Mock };
      connectSpy: jest.SpyInstance;
    } {
      const mgr = new TelegramClientManager(
        makeConfig({ mtprotoStartupDelayMs: 60_000 }),
      );
      mgr.ensureClient();
      const loggerField = (
        mgr as unknown as {
          logger: { log: jest.Mock; error: jest.Mock };
        }
      ).logger;
      const logSpy = jest
        .spyOn(loggerField, 'log')
        .mockImplementation(() => {});
      const errorSpy = jest
        .spyOn(loggerField, 'error')
        .mockImplementation(() => {});
      const connectSpy = jest
        .spyOn(protoOfLast(), 'connect')
        .mockImplementation(() => new Promise<void>(() => {}));
      return {
        mgr,
        logger: { log: logSpy, error: errorSpy },
        connectSpy,
      };
    }

    it('with mtprotoStartupDelayMs=60000 and hung client.connect(): the 20s race timer MUST NOT fire before the 60s delay completes', async () => {
      jest.useFakeTimers();
      const { mgr, logger, connectSpy } = setupManagerWithDelayAndHang();

      try {
        const p = mgr.markAuthorizedIfTrue();

        // Advance ONLY 20_000ms — this is the OLD bug: the race timer
        // would fire here and cut off the 60s delay. With the fix, the
        // delay runs UNBLOCKED, so no race timer is even armed yet
        // (the 20s timer is started AFTER the 60s delay finishes).
        jest.advanceTimersByTime(20_000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // No timeout log yet — the race hasn't fired. The 60s delay is
        // still in flight, so client.connect() was never even reached.
        const prematureTimeout = logger.log.mock.calls.find((args) =>
          String(args[0] ?? '').includes(
            'MTProto connect timed out after 20000ms',
          ),
        );
        expect(prematureTimeout).toBeUndefined();
        expect(connectSpy).not.toHaveBeenCalled();
        expect(mgr.isAuthorized()).toBe(false);

        // Now flush the rest of the 60s delay — the race timer arms,
        // then fires after another 20_000ms (total 80_000ms).
        jest.advanceTimersByTime(40_000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        // Now 60s elapsed: delay done, client.connect() invoked (hangs),
        // 20s race timer just started. Wait 20s more.
        expect(connectSpy).toHaveBeenCalledTimes(1);
        const stillNoTimeout = logger.log.mock.calls.find((args) =>
          String(args[0] ?? '').includes(
            'MTProto connect timed out after 20000ms',
          ),
        );
        expect(stillNoTimeout).toBeUndefined();

        jest.advanceTimersByTime(20_000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await p;

        // NOW the timeout log is captured (total elapsed = 80_000ms).
        const timeoutCall = logger.log.mock.calls.find((args) =>
          String(args[0] ?? '').includes(
            'MTProto connect timed out after 20000ms',
          ),
        );
        expect(timeoutCall).toBeDefined();
        expect(mgr.isAuthorized()).toBe(false);
      } finally {
        connectSpy.mockRestore();
        jest.useRealTimers();
      }
    });

    it('with mtprotoStartupDelayMs=60000 and client.connect() resolving quickly: happy path still succeeds (delay does NOT break authorization)', async () => {
      jest.useFakeTimers();
      const mgr = new TelegramClientManager(
        makeConfig({ mtprotoStartupDelayMs: 60_000 }),
      );
      mgr.ensureClient();
      const loggerField = (
        mgr as unknown as {
          logger: { log: jest.Mock; error: jest.Mock };
        }
      ).logger;
      const logSpy = jest
        .spyOn(loggerField, 'log')
        .mockImplementation(() => {});
      const connectSpy = jest
        .spyOn(protoOfLast(), 'connect')
        .mockImplementation(() => Promise.resolve());

      try {
        const p = mgr.markAuthorizedIfTrue();

        // Flush microtasks — but the 60s delay (fake-timer) blocks everything.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(mgr.isAuthorized()).toBe(false);

        // Advance the 60s delay.
        jest.advanceTimersByTime(60_000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await p;

        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(mgr.isAuthorized()).toBe(true);

        const timeoutCall = logSpy.mock.calls.find((args) =>
          String(args[0] ?? '').includes('MTProto connect timed out'),
        );
        expect(timeoutCall).toBeUndefined();
      } finally {
        connectSpy.mockRestore();
        jest.useRealTimers();
      }
    });
  });
});
