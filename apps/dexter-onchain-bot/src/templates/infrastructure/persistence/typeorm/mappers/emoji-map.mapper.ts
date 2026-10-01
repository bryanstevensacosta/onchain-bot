import { EmojiMap } from '@/templates/domain/emoji-map.entity';
import { EmojiMapOrmEntity } from '../emoji-map.orm-entity';

/** Domain <-> TypeORM mapper for `EmojiMap`. */
export const toEmojiMapRow = (map: EmojiMap): EmojiMapOrmEntity => {
  const row = new EmojiMapOrmEntity();
  row.id = map.id;
  row.placeholderKey = map.placeholderKey;
  row.matchValue = map.matchValue;
  row.emoji = map.emoji;
  row.createdAt = map.createdAt;
  return row;
};

export const toEmojiMapDomain = (row: EmojiMapOrmEntity): EmojiMap =>
  EmojiMap.reconstitute({
    id: row.id,
    placeholderKey: row.placeholderKey,
    matchValue: row.matchValue,
    emoji: row.emoji,
    createdAt: row.createdAt,
  });
