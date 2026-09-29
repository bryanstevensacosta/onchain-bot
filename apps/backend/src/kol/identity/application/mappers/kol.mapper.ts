/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL hot path moved to
 * apps/kol-calls (ingestion/extraction/parsing/normalization) +
 * apps/kol-calls-publisher (scoring/templates/approval/publishing).
 * Refactor target: delete this file at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
import type { Kol } from 'kol/identity/domain/entities/kol.entity';

/**
 * Outbound view model: KOL summary for API/UI consumers.
 */
export interface KolView {
  readonly id: string;
  readonly handle: string | null;
  readonly title: string;
  readonly isActive: boolean;
  readonly lifecycleStatus: 'ACTIVE' | 'DORMANT' | 'BLACKLISTED';
  readonly lastIngestedAt: string | null;
}

/**
 * Maps domain entities to outbound view models.
 */
export class KolMapper {
  public static toView(kol: Kol): KolView {
    return {
      id: kol.kolId.value,
      handle: kol.handle?.value ?? null,
      title: kol.title,
      isActive: kol.isActive,
      lifecycleStatus: kol.lifecycleStatus,
      lastIngestedAt: kol.lastIngestedAt?.toISOString() ?? null,
    };
  }
}
