import type { ScheduleResultCallback } from '../schedule-request';

/**
 * Terminal result callbacks scheduler → sessions (contract §4:
 * exactly one per request, at-least-once). HTTP adapter POSTs to
 * `SESSION_CALLBACK_URL` with `x-api-key`; log-only when unconfigured.
 */
export abstract class ScheduleResultCallbackPort {
  public abstract emit(callback: ScheduleResultCallback): Promise<void>;
}
