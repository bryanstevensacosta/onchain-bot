import { LaunchpadOverride } from '@/templates/domain/launchpad-override.entity';
import { LaunchpadOverrideOrmEntity } from '../launchpad-override.orm-entity';

/** Domain <-> TypeORM mapper for `LaunchpadOverride`. */
export const toLaunchpadOverrideRow = (
  row: LaunchpadOverride,
): LaunchpadOverrideOrmEntity => {
  const entity = new LaunchpadOverrideOrmEntity();
  entity.id = row.id;
  entity.mint = row.mint;
  entity.launchpadId = row.launchpadId;
  entity.note = row.note;
  entity.createdAt = row.createdAt;
  return entity;
};

export const toLaunchpadOverrideDomain = (
  row: LaunchpadOverrideOrmEntity,
): LaunchpadOverride =>
  LaunchpadOverride.reconstitute({
    id: row.id,
    mint: row.mint,
    launchpadId: row.launchpadId,
    note: row.note,
    createdAt: row.createdAt,
  });
