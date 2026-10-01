import { EmojiMapOrmEntity } from '../../templates/infrastructure/persistence/typeorm/emoji-map.orm-entity';

/**
 * DEXTER_PERSISTED_ENTITIES — TypeORM entities owned by dexter-onchain-bot.
 *
 * Foundation (todo 1): EMPTY. Future todos push their orm-entities here
 * (todo 3: MessageTemplateOrmEntity; todo 5: EmojiMapOrmEntity) and BOTH
 * `DatabaseModule` (runtime) and `data-source.ts` (CLI) pick them up
 * automatically. Single registration point — never list entities twice.
 */
export const DEXTER_PERSISTED_ENTITIES: Function[] = [EmojiMapOrmEntity];
