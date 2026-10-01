import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDexterMessageTemplates1790874073025 implements MigrationInterface {
    name = 'CreateDexterMessageTemplates1790874073025'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "dexter_message_templates" ("id" uuid NOT NULL, "command" character varying(16) NOT NULL, "name" character varying(100) NOT NULL, "bodyMarkdown" text NOT NULL, "isActive" boolean NOT NULL DEFAULT false, "version" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_dexter_message_templates_command_name" UNIQUE ("command", "name"), CONSTRAINT "PK_2e84474d1e83ffa0b48cfa6ea6e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_dexter_message_templates_command_active" ON "dexter_message_templates" ("command") WHERE "isActive" = TRUE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."uq_dexter_message_templates_command_active"`);
        await queryRunner.query(`DROP TABLE "dexter_message_templates"`);
    }

}
