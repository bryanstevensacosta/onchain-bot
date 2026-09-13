// Type-resolution shim for `telegram/extensions/Logger`.
//
// `tsconfig.json` maps `telegram/*` → `src/telegram/*`, so `tsc` resolves the
// backend's `import ... from 'telegram/extensions/Logger'` to this file. The
// runtime `require()` below loads the real gramJS module from `node_modules/`
// (a bare `telegram/...` import here would redirect back to itself, hence the
// runtime require + the RELATIVE type-only import, which bypasses the alias).
//
// The exported bindings keep the REAL gramJS types (via `import type`) so
// downstream consumers (e.g. `telegram-client-manager.service.ts`) don't
// degrade to `any` — that trips `no-unsafe-return` / `no-unsafe-call`
// (lint errors, CI failure). The try/catch only guards the RUNTIME load for
// SSE/Mock modes where the MTProto package may be absent; fallbacks are
// structurally compatible stubs cast to the real types.

import type {
  Logger as GramjsLoggerType,
  LogLevel as GramjsLogLevelType,
} from '../../../../../node_modules/telegram/extensions/Logger';

let Logger: typeof GramjsLoggerType;
let LogLevel: typeof GramjsLogLevelType;

const fallbackLogger = class Logger {} as unknown as typeof GramjsLoggerType;
const fallbackLogLevel = {
  NONE: 'none',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as unknown as typeof GramjsLogLevelType;

try {
  // Direct require - Node's module system will find node_modules/telegram.
  // Typed as a partial view so member access stays type-safe.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const telegramLogger = require('telegram/extensions/Logger') as {
    Logger?: typeof GramjsLoggerType;
    LogLevel?: typeof GramjsLogLevelType;
    default?: {
      Logger?: typeof GramjsLoggerType;
      LogLevel?: typeof GramjsLogLevelType;
    };
  };

  // Access properties directly from the module object
  Logger = telegramLogger['Logger'] ?? fallbackLogger;
  LogLevel = telegramLogger['LogLevel'] ?? fallbackLogLevel;

  // Debug: verify we loaded correctly
  if (Logger === fallbackLogger || LogLevel === fallbackLogLevel) {
    console.error(
      '[Logger shim] Properties undefined, trying alternative access...',
    );
    // Maybe it's a default export?
    const alt = telegramLogger.default ?? {};
    Logger = alt.Logger ?? Logger;
    LogLevel = alt.LogLevel ?? LogLevel;
  }

  // Still fallback? Log it
  if (Logger === fallbackLogger || LogLevel === fallbackLogLevel) {
    console.warn(
      '[Logger shim] Could not access Logger/LogLevel, using fallback',
    );
    Logger = fallbackLogger;
    LogLevel = fallbackLogLevel;
  }
} catch (error) {
  // Fallback if telegram package is not available or cannot be loaded
  console.warn(
    '[Logger shim] Could not load telegram/extensions/Logger:',
    (error as Error)?.message ?? String(error),
  );
  // Provide minimal stubs so the module can at least be imported
  Logger = fallbackLogger;
  LogLevel = fallbackLogLevel;
}

// Re-export
export { Logger, LogLevel };
