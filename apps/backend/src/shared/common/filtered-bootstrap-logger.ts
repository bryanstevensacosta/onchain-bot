import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { ConsoleLogger } from '@nestjs/common/services/console-logger.service';
import { Logger as PinoLogger } from 'nestjs-pino';

/**
 * App-wide `LoggerService` that suppresses Nest's framework chatter while
 * keeping every log our own application code emits.
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
 * - InstanceLoader       - every `X dependencies initialized +Yms`
 * - RouterExplorer       - every `Mapped {/route, METHOD} route +Yms`
 * - RoutesResolver       - every `Controller {prefix}: +Yms`
 * - WebSocketsController - every `Gateway subscribed to "X" message +Yms`
 *
 * What it keeps
 * -------------
 * - log()/warn()/error() from every `new Logger(ClassName)` in app code
 * - The level filter is the user's choice (default: log/warn/error only,
 *   matching the agreed policy of no debug/verbose noise in any env).
 *
 * Why a custom class instead of `logger: false`
 * --------------------------------------------
 * `logger: false` would also silence our own Logger instances - they're
 * resolved through the same service. We need app logs to keep flowing.
 *
 * Backend emission
 * ----------------
 * When wired through `app.useLogger(app.get(FilteredBootstrapLogger))` in
 * `main.ts`, this class delegates writing to the nestjs-pino `Logger` so
 * that logs land in:
 *   - `apps/backend/logs/backend-<NODE_ENV>.log` (rotated by pino-roll),
 *   - console (pretty-printed by pino-pretty in non-production).
 * Tests and edge cases that construct this class without DI fall back to
 * Nest's default `ConsoleLogger` so unit tests still print to stdout.
 */
@Injectable()
export class FilteredBootstrapLogger implements LoggerService {
  private static readonly DROPPED_CONTEXTS = new Set<string>([
    'InstanceLoader',
    'RouterExplorer',
    'RoutesResolver',
    'WebSocketsController',
  ]);

  private readonly delegate: ConsoleLogger;
  private readonly pino: PinoLogger | undefined;

  constructor(pino?: PinoLogger) {
    // ConsoleLogger produces the same `[Nest] PID  - DATE  LEVEL [Context]`
    // format Nest's default logger expects, so non-DI callers (unit tests)
    // still see recognisable stdout output.
    this.delegate = new ConsoleLogger();
    this.pino = pino;
  }

  private static isDropped(context: unknown): boolean {
    return (
      typeof context === 'string' &&
      FilteredBootstrapLogger.DROPPED_CONTEXTS.has(context)
    );
  }

  log(message: unknown, context?: string): void {
    if (FilteredBootstrapLogger.isDropped(context)) return;
    if (this.pino) {
      this.pino.log(message, ...(context ? [context] : []));
      return;
    }
    this.delegate.log(message, context ?? '');
  }

  warn(message: unknown, context?: string): void {
    if (FilteredBootstrapLogger.isDropped(context)) return;
    if (this.pino) {
      this.pino.warn(message, ...(context ? [context] : []));
      return;
    }
    this.delegate.warn(message, context ?? '');
  }

  error(message: unknown, context?: string): void {
    if (FilteredBootstrapLogger.isDropped(context)) return;
    if (this.pino) {
      this.pino.error(message, ...(context ? [context] : []));
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
    if (this.pino) {
      this.pino.fatal(message, ...(context ? [context] : []));
      return;
    }
    this.delegate.fatal?.(message, context ?? '');
  }

  setLogLevels(levels: LogLevel[]): void {
    this.delegate.setLogLevels?.(levels);
  }
}
