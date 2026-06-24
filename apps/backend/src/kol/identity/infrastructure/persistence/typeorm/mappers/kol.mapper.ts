import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolHandle } from 'kol/identity/domain/value-objects/kol-handle.vo';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';

/**
 * Maps between the rich domain aggregate `Kol` and its anemic TypeORM
 * persistence shape `KolEntity`.
 *
 * Lives in infrastructure because the mapping depends on the storage
 * representation. Domain code never imports this file.
 */
export class KolMapper {
  public static toEntity(kol: Kol): KolEntity {
    const row = new KolEntity();
    row.kolId = kol.kolId.value;
    row.handle = kol.handle?.value ?? null;
    row.title = kol.title;
    row.isActive = kol.isActive;
    row.lifecycleStatus = kol.lifecycleStatus;
    row.lastIngestedAt = kol.lastIngestedAt;
    row.addedAt = (
      kol as unknown as { state: { addedAt: Date } }
    ).state.addedAt;
    return row;
  }

  public static toDomain(row: KolEntity): Kol {
    return Kol.reconstitute({
      id: KolId.fromString(row.kolId),
      handle:
        row.handle && row.handle.length > 0
          ? KolHandle.fromString(row.handle)
          : null,
      title: row.title,
      isActive: row.isActive,
      lifecycleStatus: row.lifecycleStatus,
      lastIngestedAt: row.lastIngestedAt,
      addedAt: row.addedAt,
    });
  }
}
