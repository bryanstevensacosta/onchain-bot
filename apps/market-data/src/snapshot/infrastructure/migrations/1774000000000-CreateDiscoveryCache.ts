import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the persistent discovery-cache table (dexter plan todo 30b).
 *
 * uuid PK + unique(chain, mint) + BTREE (chain, mint); columns mirror
 * `DiscoveryCacheRow`. No backfill — the table starts empty on first
 * deploy (cold scans pin rows; the tripwire + 30d lazy TTL keep them
 * honest). Dev boots use `DATABASE_SYNCHRONIZE=true` (auto-create);
 * staging/prod run this migration with `SYNCHRONIZE=false`.
 */
export class CreateDiscoveryCache1774000000000 implements MigrationInterface {
  public readonly name = 'CreateDiscoveryCache1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "discovery_cache" (' +
        '"id" uuid NOT NULL DEFAULT gen_random_uuid(), ' +
        '"chain" text NOT NULL, ' +
        '"mint" text NOT NULL, ' +
        '"pairAddress" text NOT NULL, ' +
        '"dexId" text NOT NULL, ' +
        '"updatedAt" timestamptz NOT NULL DEFAULT now(), ' +
        'CONSTRAINT "PK_discovery_cache_id" PRIMARY KEY ("id"), ' +
        'CONSTRAINT "uq_discovery_cache_chain_mint" UNIQUE ("chain", "mint")' +
        ')',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_discovery_cache_chain_mint" ' +
        'ON "discovery_cache" USING BTREE ("chain", "mint")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "discovery_cache"');
  }
}
