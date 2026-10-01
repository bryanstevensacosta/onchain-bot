import { DisplayMapOrmEntity } from '../../templates/infrastructure/persistence/typeorm/display-map.orm-entity';
import { MessageTemplateOrmEntity } from '../../templates/infrastructure/persistence/typeorm/message-template.orm-entity';

/**
 * DEXTER_PERSISTED_ENTITIES — TypeORM entities owned by dexter-onchain-bot.
 *
 * Foundation (todo 1): EMPTY. Future todos push their orm-entities here
 * (todo 3: MessageTemplateOrmEntity; todo 5: DisplayMapOrmEntity) and BOTH
 * `DatabaseModule` (runtime) and `data-source.ts` (CLI) pick them up
 * automatically. Single registration point — never list entities twice.
 *
 * Relative imports ONLY in this file: the TypeORM CLI
 * (`typeorm-ts-node-commonjs`) cannot resolve `@/` (or any tsconfig
 * paths); `@/` stays the convention everywhere the CLI never loads.
 */
export const DEXTER_PERSISTED_ENTITIES: Function[] = [
  DisplayMapOrmEntity,
  MessageTemplateOrmEntity,
];
