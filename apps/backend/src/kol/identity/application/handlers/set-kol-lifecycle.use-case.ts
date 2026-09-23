import { Injectable } from '@nestjs/common';
import { kolIdentityGone } from 'kol/identity/application/errors/kol-identity-gone.error';

export type KolLifecycleTransition = 'ACTIVE' | 'DORMANT' | 'BLACKLISTED';

export interface SetKolLifecycleInput {
  readonly kolId: string;
  readonly status: KolLifecycleTransition;
}

/**
 * 501 shim (item 8, telegram-feed-unification): lifecycle writes moved to
 * ingestion-telegram (`PATCH {INGESTION_TELEGRAM_URL}/api/feed/sources/:channelId/toggle`
 * for ACTIVE/DORMANT; `BLACKLISTED` has no feed equivalent). Kept as a named
 * shim — never silently deleted.
 */
@Injectable()
export class SetKolLifecycleUseCase {
  public async execute(_input: SetKolLifecycleInput): Promise<never> {
    throw kolIdentityGone('SetKolLifecycleUseCase.execute');
  }
}
