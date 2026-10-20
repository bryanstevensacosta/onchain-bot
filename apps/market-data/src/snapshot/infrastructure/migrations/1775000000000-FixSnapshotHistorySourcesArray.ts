import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs the `snapshot_history.sources` column type (staging schema
 * drift, found by the todo-8 soak on 2026-10-20).
 *
 * `CreateSnapshotHistory1772000000000` declared `sources` as plain
 * `text` (default `'{}'`), but the entity maps it as `text[]`
 * (`array: true`). Postgres stored the array literals in that text
 * column (`'{"a","b"}'`); TypeORM read the string back verbatim and
 * `toHistoryRow`'s spread turned it into one entry PER CHARACTER, so
 * every STALE replay on staging served a corrupted `sources` array
 * (live first-soak line: `{"onchain-direct"}` became 18 single-char
 * entries). Fresh responses were unaffected because they never read
 * the column.
 *
 * Converts the column to `text[]` in place and restores the array
 * default. All existing rows were verified well-formed literals
 * before this rewrite (staging 2026-10-20: 33/33 matched `^{.*}$`,
 * zero empty strings), so the cast is total; the CASE keeps an
 * unexpected empty string from failing the migration instead of
 * aborting the deploy. `down` restores the legacy text shape, which
 * keeps the migration reversible.
 */
export class FixSnapshotHistorySourcesArray1775000000000 implements MigrationInterface {
  public readonly name = 'FixSnapshotHistorySourcesArray1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The legacy text default ('{}') cannot be cast automatically during
    // the type change — drop it first, rewrite the type, restore the
    // array default.
    await queryRunner.query(
      'ALTER TABLE "snapshot_history" ALTER COLUMN "sources" DROP DEFAULT',
    );
    await queryRunner.query(
      'ALTER TABLE "snapshot_history" ' +
        'ALTER COLUMN "sources" TYPE text[] ' +
        'USING (CASE ' +
        'WHEN "sources" IS NULL OR btrim("sources") = \'\' ' +
        'THEN ARRAY[]::text[] ' +
        'ELSE "sources"::text[] END)',
    );
    await queryRunner.query(
      'ALTER TABLE "snapshot_history" ' +
        'ALTER COLUMN "sources" SET DEFAULT \'{}\'::text[]',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "snapshot_history" ALTER COLUMN "sources" DROP DEFAULT',
    );
    await queryRunner.query(
      'ALTER TABLE "snapshot_history" ' +
        'ALTER COLUMN "sources" TYPE text ' +
        'USING "sources"::text',
    );
    await queryRunner.query(
      'ALTER TABLE "snapshot_history" ' +
        'ALTER COLUMN "sources" SET DEFAULT \'{}\'',
    );
  }
}
