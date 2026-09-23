import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 501 factory for the deprecated backend KOL identity surface (item 8 of
 * the telegram-feed-unification plan).
 *
 * KOL identity moved to ingestion-telegram (`telegram_feed_sources`,
 * `type='kol'`). The backend keeps NO `kols` table anymore; reads flow
 * through `FeedIdentityHttpClient` (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`)
 * and every write path on this side is gone.
 *
 * SINGLE deprecation code everywhere in the plan: 501 (never 410), with a
 * hint body pointing at the exact feed replacement — same message style as
 * the split precedent (`MTProto backend removido, usar INGESTION_TELEGRAM_URL`).
 */
export function kolIdentityGone(operation: string): HttpException {
  const message = `KOL identity movida a ingestion-telegram (operacion '${operation}' eliminada del backend)`;
  const hint =
    'Usar la API feed de ingestion-telegram: ' +
    'GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol para lecturas; ' +
    'POST/PATCH/DELETE {INGESTION_TELEGRAM_URL}/api/feed/sources[/:channelId] para altas y cambios.';
  return new HttpException(
    { message, hint, operation },
    HttpStatus.NOT_IMPLEMENTED,
  );
}
