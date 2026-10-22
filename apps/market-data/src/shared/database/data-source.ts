import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseConfig } from '../infrastructure/config/database.config';
import { SnapshotHistoryEntity } from '../../snapshot/infrastructure/snapshot-history.entity';
import { DiscoveryCacheEntity } from '../../snapshot/infrastructure/discovery-cache.entity';
import { AssetRegistryEntity } from '../../asset-registry/infrastructure/asset-registry.entity';
import { CreateSnapshotHistory1772000000000 } from '../../snapshot/infrastructure/migrations/1772000000000-CreateSnapshotHistory';
import { CreateAssetRegistry1773000000000 } from '../../asset-registry/infrastructure/migrations/1773000000000-CreateAssetRegistry';
import { CreateDiscoveryCache1774000000000 } from '../../snapshot/infrastructure/migrations/1774000000000-CreateDiscoveryCache';
import { FixSnapshotHistorySourcesArray1775000000000 } from '../../snapshot/infrastructure/migrations/1775000000000-FixSnapshotHistorySourcesArray';
import { NormalizeSnapshotHistoryAddressCase1776000000000 } from '../../snapshot/infrastructure/migrations/1776000000000-NormalizeSnapshotHistoryAddressCase';

// Load env the same way the app does: `.env.dev` wins over `.env`.
// (Second dotenv.config() call never overrides already-set keys.)
dotenv.config({ path: '.env.dev' });
dotenv.config();

/**
 * TypeORM CLI data-source for market-data (staging deploy lane).
 *
 * Used ONLY by the `npm run migration:*` scripts — never at runtime.
 * The runtime path is `AppModule`'s conditional
 * `TypeOrmModule.forRootAsync` (gated on `DATABASE_ENABLED === 'true'`).
 *
 * The entity + migration lists are EXPLICIT (no glob) because migrations
 * live in two modules (`snapshot/` and `asset-registry/`), and they MUST
 * stay in sync with the lists in `app.module.ts` — there is no
 * reconciliation layer, so a future entity/migration is registered in
 * both places or the CLI and the app disagree.
 *
 * Imports are RELATIVE on purpose: the TypeORM CLI does not resolve the
 * `@/` path alias. A malformed `DATABASE_URL` fails fast on the first
 * CLI operation (the CLI connects before doing anything), so nothing is
 * written when the URL is invalid. `synchronize` is ALWAYS false here.
 */
export default new DataSource({
  type: 'postgres',
  url: buildDatabaseConfig().url,
  synchronize: false,
  migrationsRun: false,
  entities: [SnapshotHistoryEntity, AssetRegistryEntity, DiscoveryCacheEntity],
  migrations: [
    CreateSnapshotHistory1772000000000,
    CreateAssetRegistry1773000000000,
    CreateDiscoveryCache1774000000000,
    FixSnapshotHistorySourcesArray1775000000000,
    NormalizeSnapshotHistoryAddressCase1776000000000,
  ],
  migrationsTableName: 'typeorm_migrations',
});
