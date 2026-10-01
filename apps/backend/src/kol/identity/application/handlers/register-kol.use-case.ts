/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL hot path moved to
 * apps/kol-calls (ingestion/extraction/parsing/normalization) +
 * apps/kol-calls-publisher (scoring/templates/approval/publishing).
 * Refactor target: delete this file at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
import { Injectable } from '@nestjs/common';
import type { RegisterKolInput } from 'kol/identity/api/input/register-kol.input';
import type { KolView } from 'kol/identity/application/mappers/kol.mapper';
import { kolIdentityGone } from 'kol/identity/application/errors/kol-identity-gone.error';

/**
 * 501 shim (item 8, telegram-feed-unification): KOL registration moved to
 * ingestion-telegram (`POST {INGESTION_TELEGRAM_URL}/api/feed/sources`
 * with `type: 'kol'`). Kept as a named shim — never silently deleted —
 * so DI consumers fail loud with the feed hint instead of 500/404.
 */
@Injectable()
export class RegisterKolUseCase {
  public async execute(_input: RegisterKolInput): Promise<KolView> {
    throw kolIdentityGone('RegisterKolUseCase.execute');
  }
}
