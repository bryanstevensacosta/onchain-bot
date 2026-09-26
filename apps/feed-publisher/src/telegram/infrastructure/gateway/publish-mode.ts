import type { ConfigService } from '@nestjs/config';
import type {
  FeedPublishMode,
  TelegramConfig,
} from '../../../shared/config/telegram.config';

/**
 * Publish-path selector reader (telegram-bots-gateway todo 5).
 *
 * `direct` = legacy adapters only (deprecated); `dual` = gateway +
 * direct, compare, return the direct leg (parity runs); `gateway` =
 * gateway only, fail-closed (cutover). Defaults to `dual` when the
 * namespace is absent (unit specs + keyless dev), so parity runs
 * unless an operator pins `direct`.
 */
export function resolveFeedPublishMode(
  config?: ConfigService,
): FeedPublishMode {
  try {
    const namespaced =
      config?.get<TelegramConfig>('telegram')?.botsGateway?.publishMode;
    if (
      namespaced === 'direct' ||
      namespaced === 'dual' ||
      namespaced === 'gateway'
    ) {
      return namespaced;
    }
    const flat = config?.get<string>('FEED_PUBLISH_MODE', 'dual') ?? 'dual';
    const mode = flat.trim().toLowerCase();
    if (mode === 'direct' || mode === 'dual' || mode === 'gateway') {
      return mode;
    }
  } catch {
    // Fail-open to dual: parity visibility over silent direct sends.
  }
  return 'dual';
}
