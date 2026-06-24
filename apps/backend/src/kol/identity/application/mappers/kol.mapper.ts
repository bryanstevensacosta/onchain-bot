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
