import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDexterEmojiMaps1790873234702 implements MigrationInterface {
    name = 'CreateDexterEmojiMaps1790873234702'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "dexter_emoji_maps" ("id" uuid NOT NULL, "placeholderKey" character varying(40) NOT NULL, "matchValue" character varying(40) NOT NULL, "emoji" character varying(64) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_dexter_emoji_maps_key_value" UNIQUE ("placeholderKey", "matchValue"), CONSTRAINT "PK_148b1336323d9fef12a5764828d" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "dexter_emoji_maps"`);
    }

}
