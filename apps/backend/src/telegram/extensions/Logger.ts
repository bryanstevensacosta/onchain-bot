// Type-resolution shim for `telegram/extensions/Logger`.
//
// At runtime, this file needs to load from node_modules/telegram, not from src/telegram.
// We use a try-catch to gracefully handle cases where the telegram package isn't available.

let Logger: any;
let LogLevel: any;

try {
  // Direct require - Node's module system will find node_modules/telegram
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const telegramLogger = require('telegram/extensions/Logger');

  // Access properties directly from the module object
  Logger = telegramLogger['Logger'];
  LogLevel = telegramLogger['LogLevel'];

  // Debug: verify we loaded correctly
  if (!Logger || !LogLevel) {
    console.error(
      '[Logger shim] Properties undefined, trying alternative access...',
    );
    // Maybe it's a default export?
    const alt = telegramLogger.default || telegramLogger;
    Logger = alt.Logger || Logger;
    LogLevel = alt.LogLevel || LogLevel;
  }

  // Still undefined? Use fallback
  if (!Logger || !LogLevel) {
    console.warn(
      '[Logger shim] Could not access Logger/LogLevel, using fallback',
    );
    Logger = class Logger {};
    LogLevel = {
      NONE: 'none',
      ERROR: 'error',
      WARN: 'warn',
      INFO: 'info',
      DEBUG: 'debug',
    };
  }
} catch (error) {
  // Fallback if telegram package is not available or cannot be loaded
  console.warn(
    '[Logger shim] Could not load telegram/extensions/Logger:',
    error.message,
  );
  // Provide minimal stubs so the module can at least be imported
  Logger = class Logger {};
  LogLevel = {
    NONE: 'none',
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
  };
}

// Re-export
export { Logger, LogLevel };
