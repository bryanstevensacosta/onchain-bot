import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScheduleResultCallback } from '../../domain/schedule-request';
import { ScheduleResultCallbackPort } from '../../domain/ports/schedule-result-callback.port';

/**
 * HTTP result callbacks scheduler → sessions (contract §4,
 * at-least-once): POSTs the terminal callback to
 * `SESSION_CALLBACK_URL` with `x-api-key`, 3 bounded attempts, then
 * logs the loss (the consumer dedups on `scheduledPostId`, so a
 * redelivered callback is safe but a lost one needs the log).
 * Log-only when no callback URL is configured (single-app dev).
 */
@Injectable()
export class HttpScheduleResultCallback extends ScheduleResultCallbackPort {
  private readonly logger = new Logger(HttpScheduleResultCallback.name);

  public constructor(private readonly config: ConfigService) {
    super();
  }

  public async emit(callback: ScheduleResultCallback): Promise<void> {
    const url = (this.config.get<string>('SESSION_CALLBACK_URL', '') ?? '').trim();
    if (!url) {
      this.logger.log(
        `callback log-only (no SESSION_CALLBACK_URL): ${callback.scheduledPostId} ${callback.state}`,
      );
      return;
    }
    const apiKey = (this.config.get<string>('SESSION_CALLBACK_API_KEY', '') ?? '').trim();
    const rawBody = JSON.stringify(callback);
    let lastError = 'unknown error';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(apiKey ? { 'x-api-key': apiKey } : {}),
            },
            body: rawBody,
            signal: controller.signal,
          });
          if (res.ok) return;
          lastError = `callback failed (http ${res.status})`;
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'unknown error';
      }
    }
    this.logger.error(
      `callback lost after 3 attempts: ${callback.scheduledPostId} ${callback.state} (${lastError})`,
    );
  }
}
