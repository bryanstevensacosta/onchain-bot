import { DisplayMap } from '@/templates/domain/display-map.entity';
import { DisplayMapOrmEntity } from '../display-map.orm-entity';

/** Domain <-> TypeORM mapper for `DisplayMap`. */
export const toDisplayMapRow = (map: DisplayMap): DisplayMapOrmEntity => {
  const row = new DisplayMapOrmEntity();
  row.id = map.id;
  row.placeholderKey = map.placeholderKey;
  row.matchValue = map.matchValue;
  row.display = map.display;
  row.createdAt = map.createdAt;
  return row;
};

export const toDisplayMapDomain = (row: DisplayMapOrmEntity): DisplayMap =>
  DisplayMap.reconstitute({
    id: row.id,
    placeholderKey: row.placeholderKey,
    matchValue: row.matchValue,
    display: row.display,
    createdAt: row.createdAt,
  });
