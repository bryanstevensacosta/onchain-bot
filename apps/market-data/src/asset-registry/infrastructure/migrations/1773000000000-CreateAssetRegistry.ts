import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the asset registry table (Tramo 3, asset-registry).
 *
 * uuid PK + unique(chain, contract) + BTREE indexes on
 * (chain, contract), cmcId, geckoId, (chain, symbol). Contracts are
 * stored lowercased by the repository (the PK-ish dedup contract).
 * No backfill — the table starts empty on first deploy; rows are
 * created lazily by snapshot traffic + the slow refresh cron.
 */
export class CreateAssetRegistry1773000000000 implements MigrationInterface {
  public readonly name = 'CreateAssetRegistry1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(
      'CREATE TABLE "asset_registry" (' +
        '"id" uuid NOT NULL DEFAULT gen_random_uuid(), ' +
        '"chain" text NOT NULL, ' +
        '"contract" text NOT NULL, ' +
        '"symbol" text, ' +
        '"name" text, ' +
        '"cmcId" integer, ' +
        '"geckoId" text, ' +
        '"providerIds" jsonb NOT NULL DEFAULT \'{}\', ' +
        '"logoUrl" text, ' +
        '"categories" text NOT NULL DEFAULT \'{}\', ' +
        '"createdAt" timestamptz NOT NULL DEFAULT now(), ' +
        '"updatedAt" timestamptz NOT NULL DEFAULT now(), ' +
        'CONSTRAINT "PK_asset_registry_id" PRIMARY KEY ("id"), ' +
        'CONSTRAINT "uq_asset_registry_chain_contract" UNIQUE ("chain", "contract")' +
        ')',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_asset_registry_chain_contract" ' +
        'ON "asset_registry" USING BTREE ("chain", "contract")',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_asset_registry_cmc" ON "asset_registry" USING BTREE ("cmcId")',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_asset_registry_gecko" ON "asset_registry" USING BTREE ("geckoId")',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_asset_registry_symbol_chain" ' +
        'ON "asset_registry" USING BTREE ("chain", "symbol")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "asset_registry"');
  }
}
