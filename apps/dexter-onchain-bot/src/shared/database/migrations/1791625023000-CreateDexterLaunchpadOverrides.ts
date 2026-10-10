import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDexterLaunchpadOverrides1791625023000 implements MigrationInterface {
  name = 'CreateDexterLaunchpadOverrides1791625023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "dexter_launchpad_overrides" ("id" uuid NOT NULL, "mint" character varying(64) NOT NULL, "launchpad_id" character varying(40) NOT NULL, "note" character varying(280), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_dexter_launchpad_overrides_mint" UNIQUE ("mint"), CONSTRAINT "PK_7e4b1c9d2a6f4a3b8c5d1e2f0a4b6c8d" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "dexter_launchpad_overrides"`);
  }
}
