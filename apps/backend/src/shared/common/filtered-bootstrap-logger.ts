import { LoggerService, LogLevel } from '@nestjs/common';
import { ConsoleLogger } from '@nestjs/common/services/console-logger.service';

/**
 * Boot-only logger that suppresses Nest's framework chatter while keeping
 * every log our own application code emits.
 *
 * Why this exists
 * ---------------
 * NestJS prints, by default, a line per `imports: [...]` entry (InstanceLoader)
 * and a line per HTTP/WS route mapping (RouterExplorer/RoutesResolver). For a
 * backend with 25+ modules and 60+ routes that adds ~100 noise lines before
 * `app.listen()` is reached. None of those lines carry information that isn't
 * already obvious from the source code, so we drop them at the logger boundary
 * instead of editing every module.
 *
 * What it drops
 * -------------
 * - InstanceLoader       — every `X dependencies initialized +Yms`
 * - RouterExplorer       — every `Mapped {/route, METHOD} route +Yms`
 * - RoutesResolver       — every `Controller {prefix}: +Yms`
 * - WebSocketsController — every `Gateway subscribed to "X" message +Yms`
 *
 * What it keeps
 * -------------
 * - log()/warn()/error() from every `new Logger(ClassName)` in app code
 * - The level filter is the user's choice (default: log/warn/error only,
 *   matching the agreed policy of no debug/verbose noise in any env).
 *
 * Why a custom class instead of `logger: false`
 * --------------------------------------------
 * `logger: false` would also silence our own Logger instances — they're
 * resolved through the same service. We need app logs to keep flowing.
 */
export class FilteredBootstrapLogger implements LoggerService {
  private static readonly DROPPED_CONTEXTS = new Set<string>([
    'InstanceLoader',
    'RouterExplorer',
    'RoutesResolver',
    'WebSocketsController',
  ]);

  private readonly delegate: ConsoleLogger;

  constructor(context?: string) {
    // ConsoleLogger is the default Nest logger and produces the same
    // `[Nest] PID  - DATE  LEVEL [Context] message` format users expect.
    this.delegate = context
      ? new ConsoleLogger(context)
      : new ConsoleLogger();
  }

  log(message: unknown, context?: string): void {
    if (context && FilteredBootstrapLogger.DROPPED_CONTEXTS.has(context)) {
      return;
    }
    this.delegate.log(message, context ?? '');
  }

  warn(message: unknown, context?: string): void {
    if (context && FilteredBootstrapLogger.DROPPED_CONTEXTS.has(context)) {
      return;
    }
    this.delegate.warn(message, context ?? '');
  }

  error(message: unknown, context?: string): void {
    if (context && FilteredBootstrapLogger.DROPPED_CONTEXTS.has(context)) {
      return;
    }
    this.delegate.error(message, context ?? '');
  }

  debug(message: unknown, context?: string): void {
    // Intentionally not implemented: the agreed log-level policy is
    // log/warn/error only. Any caller using `logger.debug()` will get a
    // no-op via the interface default and emit nothing.
    void message;
    void context;
  }

  verbose(message: unknown, context?: string): void {
    void message;
    void context;
  }

  fatal(message: unknown, context?: string): void {
    this.delegate.fatal?.(message, context ?? '');
  }

  setLogLevels(levels: LogLevel[]): void {
    this.delegate.setLogLevels?.(levels);
  }
}