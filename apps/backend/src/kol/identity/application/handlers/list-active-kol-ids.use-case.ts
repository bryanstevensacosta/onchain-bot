import { Injectable } from '@nestjs/common';
import { kolIdentityGone } from 'kol/identity/application/errors/kol-identity-gone.error';

/**
 * 501 shim (item 8, telegram-feed-unification): active-ID listing moved to
 * ingestion-telegram (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources/active/ids?type=kol`).
 * Backend pipeline reads go through `FeedIdentityHttpClient` (the
 * `KolRepository` port) instead. Kept as a named shim — never silently deleted.
 */
@Injectable()
export class ListActiveKolIdsUseCase {
  public async execute(): Promise<ReadonlyArray<string>> {
    throw kolIdentityGone('ListActiveKolIdsUseCase.execute');
  }
}
