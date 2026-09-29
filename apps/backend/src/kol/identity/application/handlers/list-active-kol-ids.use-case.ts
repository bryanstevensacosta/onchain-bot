/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL hot path moved to
 * apps/kol-calls (ingestion/extraction/parsing/normalization) +
 * apps/kol-calls-publisher (scoring/templates/approval/publishing).
 * Refactor target: delete this file at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
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
