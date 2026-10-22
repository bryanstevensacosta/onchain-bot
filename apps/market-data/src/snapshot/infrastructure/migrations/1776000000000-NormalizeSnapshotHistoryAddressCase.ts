import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs mixed-case `snapshot_history` identity columns (staging bug
 * found 2026-10-22).
 *
 * `SnapshotHistoryRepository.saveSeeded` stored `chain`/`address`
 * verbatim, and `AddressSnapshotService.seedFdvAthHistory` passes the
 * checksummed EVM address (`0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF`).
 * The DB-path reads (`findFdvAth`, `findAnchorAt`) lowercase the
 * wanted value and query `where: { chain, address }` — case-sensitive
 * equality in Postgres — so the seeded ATH row was invisible: the app
 * served the live max only, `seeded` stayed `false`, and the one-shot
 * seed retried forever (Gecko quota pressure).
 *
 * The write path now normalizes `key`/`chain`/`address` with
 * `trim().toLowerCase()`; this migration repairs rows written before
 * that fix. Both expressions are idempotent: rows already in
 * canonical form are untouched, and `lower(btrim(...))` collapses to
 * itself on a second run.
 *
 * `down` is a documented no-op: the original casing carried no
 * semantics (identity comparison is case-insensitive everywhere by
 * design), so there is nothing meaningful to restore — and a repair
 * migration must never throw on revert.
 */
export class NormalizeSnapshotHistoryAddressCase1776000000000 implements MigrationInterface {
  public readonly name = 'NormalizeSnapshotHistoryAddressCase1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE "snapshot_history" ' +
        'SET "address" = lower(btrim("address")) ' +
        'WHERE "address" <> lower(btrim("address"))',
    );
    await queryRunner.query(
      'UPDATE "snapshot_history" ' +
        'SET "chain" = lower(btrim("chain")) ' +
        'WHERE "chain" <> lower(btrim("chain"))',
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally empty: the lowercased form IS the canonical form
    // (the original casing had no semantics) and a repair must stay
    // idempotent/revertible without data loss or a throw.
  }
}
