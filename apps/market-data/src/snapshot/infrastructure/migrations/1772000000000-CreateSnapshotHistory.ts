import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the persistent snapshot history table
 * (Tramo 3, todo 14, GAP-1).
 *
 * uuid PK + unique(key, createdAt) + BTREE (key, createdAt); columns
 * mirror `SnapshotHistoryRow`. No backfill — the table starts empty
 * on first deploy (the in-memory ring is NOT migrated; documented in
 * the todo-14 evidence log). Dev boots use `DATABASE_SYNCHRONIZE=true`
 * (auto-create); staging/prod run this migration with
 * `SYNCHRONIZE=false`.
 */
export class CreateSnapshotHistory1772000000000 implements MigrationInterface {
  public readonly name = 'CreateSnapshotHistory1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
    );
    await queryRunner.query(
      'CREATE TABLE "snapshot_history" (' +
        '"id" uuid NOT NULL DEFAULT gen_random_uuid(), ' +
        '"key" text NOT NULL, ' +
        '"chain" text NOT NULL, ' +
        '"address" text NOT NULL, ' +
        '"kind" text NOT NULL, ' +
        '"status" text NOT NULL, ' +
        '"quote" jsonb NOT NULL, ' +
        '"sources" text NOT NULL DEFAULT \'{}\', ' +
        '"providerErrors" jsonb NOT NULL, ' +
        '"createdAt" timestamptz NOT NULL DEFAULT now(), ' +
        'CONSTRAINT "PK_snapshot_history_id" PRIMARY KEY ("id"), ' +
        'CONSTRAINT "uq_snapshot_history_key_created" UNIQUE ("key", "createdAt")' +
        ')',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_snapshot_history_key_created" ' +
        'ON "snapshot_history" USING BTREE ("key", "createdAt")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "snapshot_history"');
  }
}
