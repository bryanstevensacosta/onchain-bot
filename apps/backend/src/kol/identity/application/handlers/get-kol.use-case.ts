import { Injectable } from '@nestjs/common';
import type { KolView } from 'kol/identity/application/mappers/kol.mapper';
import { kolIdentityGone } from 'kol/identity/application/errors/kol-identity-gone.error';

/**
 * 501 shim (item 8, telegram-feed-unification): single-KOL reads moved to
 * ingestion-telegram (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`).
 * Kept as a named shim — never silently deleted.
 */
@Injectable()
export class GetKolUseCase {
  public async execute(_kolId: string): Promise<KolView> {
    throw kolIdentityGone('GetKolUseCase.execute');
  }
}
