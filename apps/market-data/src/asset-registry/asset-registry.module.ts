import { Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/infrastructure/config/database.config';
import { AssetRegistryPort } from './domain/asset-registry.port';
import { AssetResolverService } from './application/asset-resolver.service';
import { AssetMetadataRefreshService } from './application/asset-metadata-refresh.service';
import { AssetRegistryEntity } from './infrastructure/asset-registry.entity';
import { InMemoryAssetRegistryRepository } from './infrastructure/in-memory-asset-registry.repository';
import { TypeOrmAssetRegistryRepository } from './infrastructure/typeorm-asset-registry.repository';

/**
 * AssetRegistryModule (Tramo 3, asset-registry).
 *
 * Owns the `asset_registry` table + resolution. The store behind
 * `AssetRegistryPort` is Postgres when `DATABASE_ENABLED=true`
 * (entity + migration wired here) and the in-memory twin otherwise
 * (same contract, zero boot coupling). The slow-metadata refresh
 * cron starts with the module (single timer, `onModuleDestroy`
 * stops it). HTTP lives in gateway/ per P43.
 */
@Module({
  imports: [
    ...(isDatabaseEnabled() ? [TypeOrmModule.forFeature([AssetRegistryEntity])] : []),
  ],
  providers: [
    InMemoryAssetRegistryRepository,
    TypeOrmAssetRegistryRepository,
    {
      provide: AssetRegistryPort,
      useFactory: (memory: InMemoryAssetRegistryRepository, pg: TypeOrmAssetRegistryRepository) =>
        isDatabaseEnabled() ? pg : memory,
      inject: [InMemoryAssetRegistryRepository, TypeOrmAssetRegistryRepository],
    },
    {
      provide: AssetResolverService,
      useFactory: (store: AssetRegistryPort) => new AssetResolverService(store),
      inject: [AssetRegistryPort],
    },
    {
      provide: AssetMetadataRefreshService,
      useFactory: (store: AssetRegistryPort) => new AssetMetadataRefreshService(store),
      inject: [AssetRegistryPort],
    },
  ],
  exports: [AssetRegistryPort, AssetResolverService, AssetMetadataRefreshService],
})
export class AssetRegistryModule implements OnModuleInit, OnModuleDestroy {
  public constructor(private readonly refresh: AssetMetadataRefreshService) {}

  public onModuleInit(): void {
    if (process.env.ASSET_REGISTRY_REFRESH_ENABLED !== 'false') {
      this.refresh.start();
    }
  }

  public onModuleDestroy(): void {
    this.refresh.stop();
  }
}
