import { Injectable } from '@nestjs/common';
import type { KolView } from 'kol/identity/application/mappers/kol.mapper';
import { kolIdentityGone } from 'kol/identity/application/errors/kol-identity-gone.error';

/**
 * 501 shim (item 8, telegram-feed-unification): KOL listing moved to
 * ingestion-telegram (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`).
 * Backend pipeline reads go through `FeedIdentityHttpClient` (the
 * `KolRepository` port) instead. Kept as a named shim — never silently deleted.
 */
@Injectable()
export class ListKolsUseCase {
  public async execute(): Promise<ReadonlyArray<KolView>> {
    throw kolIdentityGone('ListKolsUseCase.execute');
  }
}
