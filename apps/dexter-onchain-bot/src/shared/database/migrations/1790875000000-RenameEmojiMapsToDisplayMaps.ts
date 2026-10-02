import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameEmojiMapsToDisplayMaps1790875000000 implements MigrationInterface {
  name = 'RenameEmojiMapsToDisplayMaps1790875000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dexter_emoji_maps" RENAME TO "dexter_display_maps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dexter_display_maps" RENAME CONSTRAINT "uq_dexter_emoji_maps_key_value" TO "uq_dexter_display_maps_key_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dexter_display_maps" RENAME COLUMN "emoji" TO "display"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dexter_display_maps" RENAME COLUMN "display" TO "emoji"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dexter_display_maps" RENAME CONSTRAINT "uq_dexter_display_maps_key_value" TO "uq_dexter_emoji_maps_key_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dexter_display_maps" RENAME TO "dexter_emoji_maps"`,
    );
  }
}
