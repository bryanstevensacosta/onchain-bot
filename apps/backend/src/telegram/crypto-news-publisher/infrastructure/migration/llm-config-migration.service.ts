import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { LlmConfigEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/llm-config.entity';
import { PromptTemplateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity';
import { LlmConfigMapper } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/llm-config.mapper';
import { PromptTemplateMapper } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/prompt-template.mapper';
import {
  DEFAULT_CONFIG,
  type CryptoNewsPublisherConfigJson,
} from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';

/**
 * On-boot one-shot migration: seed `LlmConfig` (id = 1) and at least
 * one `PromptTemplate` row when the DB is empty, idempotently.
 *
 * **Branches**
 *   - **A — JSON file present** (`config/crypto-news-publisher.config.json`).
 *     Import `targetChannel`, `enabled`, and the publishing
 *     sub-object (`dailyCap`, `dailyResetUtcHour`, `randomDelayMinMs`,
 *     `randomDelayMaxMs`, `llmMaxAttempts`) plus the prompt body's
 *     `template` and `model`. Create one `PromptTemplate` named
 *     "Default (imported)" with maxTokens/temperature from the
 *     call-site defaults (`MAX_TOKENS_DEFAULT = 2000`,
 *     `TEMPERATURE_DEFAULT = 0.7` — these match the constants the
 *     `CryptoNewsLlmAdapter` used prior to this BC transition).
 *   - **B — JSON file absent.** Same shape as A but every value
 *     comes from the in-code defaults (`DEFAULT_CONFIG.publishing`
 *     and `DEFAULT_CONFIG.prompt.template`). The template is named
 *     "Default".
 *
 * **Idempotency.** On every boot, the migration opens a Postgres
 * transaction and checks for an existing `LlmConfig` row first.
 * If found, the transaction commits immediately and no rows are
 * touched. The transaction is required so two replicas booting
 * simultaneously cannot both insert (the unique PK on the LlmConfig
 * table — `id = 1` — serialises the second one with a constraint
 * violation, but the empty-check inside the transaction gives us
 * a clean "already seeded, skip" outcome instead).
 *
 * **Why a service and not a TypeORM migration script.** This runs
 * inside `OnApplicationBootstrap` so it benefits from NestJS DI
 * (`@InjectDataSource`) and so dev environments using the in-memory
 * T1 adapter paths can still bootstrap. A typeorm `Migration`
 * script would require schema-management tooling and lose the
 * `OnApplicationBootstrap`-lifecycle ordering with the rest of
 * the BC's providers.
 *
 * **Wave 1 note.** The plan calls for deleting
 * `config/crypto-news-publisher.config.json` as part of T1;
 * in practice we KEEP the file until T2 swaps the use case to
 * read from the new LlmConfigRepo. While the file is kept, this
 * migration's `readJsonConfigOrNull()` reads it; once T2 deletes
 * it, the migration permanently takes Branch B for that deployment.
 */
@Injectable()
export class LlmConfigMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LlmConfigMigrationService.name);

  private static readonly CONFIG_ROW_ID = 1;
  private static readonly MAX_TOKENS_DEFAULT = 2000;
  private static readonly TEMPERATURE_DEFAULT = 0.7;
  private static readonly JSON_PATH = join(
    process.cwd(),
    'config',
    'crypto-news-publisher.config.json',
  );

  public constructor(
    @InjectRepository(PromptTemplateEntity)
    private readonly templateRepo: Repository<PromptTemplateEntity>,
    @InjectRepository(LlmConfigEntity)
    private readonly configRepo: Repository<LlmConfigEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.seedIfEmpty();
      if (result.seeded) {
        this.logger.log(
          `[llm-config-migration] seeded LlmConfig + ${result.templateCount} template(s)`,
        );
      } else {
        this.logger.debug(
          '[llm-config-migration] LlmConfig row already present — no-op',
        );
      }
    } catch (err) {
      this.logger.error(
        `[llm-config-migration] failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Do NOT rethrow: a failed bootstrap migration must not stop
      // the rest of the app from starting. `LlmConfigRepository.load()`
      // will throw the next time the cron tries to drain, surfacing
      // the same condition at the right boundary.
    }
  }

  /**
   * Public for spec purposes. Runs the full migration inside one
   * transaction: idempotency check, branch resolution, insert,
   * commit. Returns `{ seeded: false }` if the row already exists
   * or `{ seeded: true, templateCount }` if it inserted rows.
   *
   * The optional `jsonConfig` parameter lets the spec bypass the
   * filesystem read; when omitted, the migration reads from
   * `crypto-news-publisher.config.json` on disk.
   */
  public async seedIfEmpty(
    jsonConfig?: CryptoNewsPublisherConfigJson | null,
  ): Promise<{
    seeded: boolean;
    templateCount: number;
  }> {
    const providedJson = jsonConfig !== undefined ? jsonConfig : null;
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(LlmConfigEntity, {
        where: { id: LlmConfigMigrationService.CONFIG_ROW_ID },
      });
      if (existing) {
        return { seeded: false, templateCount: 0 };
      }
      const cfg =
        providedJson ?? LlmConfigMigrationService.readJsonConfigOrNull();
      const templateCount = await LlmConfigMigrationService.seedRows(
        manager,
        cfg,
      );
      return { seeded: true, templateCount };
    });
  }

  /**
   * Visible for testing. Reads the on-disk JSON config; returns
   * `null` when the file is missing or unparseable.
   */
  protected static readJsonConfigOrNull(): CryptoNewsPublisherConfigJson | null {
    if (!existsSync(LlmConfigMigrationService.JSON_PATH)) return null;
    try {
      return JSON.parse(
        readFileSync(LlmConfigMigrationService.JSON_PATH, 'utf-8'),
      ) as CryptoNewsPublisherConfigJson;
    } catch {
      return null;
    }
  }

  /**
   * Pure helper, easy to unit-test in isolation. Inserts one
   * prompt template then one LlmConfig row inside the supplied
   * `EntityManager`. Returns the number of templates inserted (1).
   */
  private static async seedRows(
    manager: EntityManager,
    cfg: CryptoNewsPublisherConfigJson | null,
  ): Promise<number> {
    const template = LlmConfigMigrationService.buildTemplate(cfg);
    const templateRow = PromptTemplateMapper.toEntity(template);
    await manager.save(templateRow);

    const llmConfig = LlmConfigMigrationService.buildLlmConfig(
      cfg,
      template.id,
    );
    const llmRow = LlmConfigMapper.toEntity(llmConfig);
    await manager.save(llmRow);

    return 1;
  }

  /**
   * Build the seed `PromptTemplate` from the JSON config (if any).
   * The name is "Default (imported)" when an existing JSON provided
   * the body, "Default" otherwise — semantically the same row but
   * the suffix signals provenance in the UI.
   */
  private static buildTemplate(
    cfg: CryptoNewsPublisherConfigJson | null,
  ): PromptTemplate {
    const name = cfg ? 'Default (imported)' : 'Default';
    const model =
      cfg?.prompt?.model && cfg.prompt.model.trim().length > 0
        ? cfg.prompt.model
        : DEFAULT_CONFIG.prompt.model;
    const promptText =
      cfg?.prompt?.template && cfg.prompt.template.trim().length > 0
        ? cfg.prompt.template
        : DEFAULT_CONFIG.prompt.template;
    return PromptTemplate.create({
      name,
      description: cfg
        ? 'Seeded from config/crypto-news-publisher.config.json on first boot.'
        : 'Bootstrapped with the in-code defaults — the JSON config file was absent.',
      model,
      maxTokens: LlmConfigMigrationService.MAX_TOKENS_DEFAULT,
      temperature: LlmConfigMigrationService.TEMPERATURE_DEFAULT,
      reasoningEffort: null,
      promptText,
    });
  }

  /**
   * Build the seed `LlmConfig` (id = 1) using the JSON's publishing
   * block when present, falling back to the in-code defaults.
   */
  private static buildLlmConfig(
    cfg: CryptoNewsPublisherConfigJson | null,
    defaultTemplateId: string,
  ): LlmConfig {
    const enabled = cfg?.enabled ?? DEFAULT_CONFIG.enabled;
    const targetChannel = cfg?.targetChannel ?? DEFAULT_CONFIG.targetChannel;
    const publishing = cfg?.publishing ?? {};
    return LlmConfig.load({
      id: LlmConfigMigrationService.CONFIG_ROW_ID,
      defaultTemplateId,
      targetChannel,
      enabled,
      dailyCap: publishing.dailyCap ?? DEFAULT_CONFIG.publishing.dailyCap,
      dailyResetUtcHour:
        publishing.dailyResetUtcHour ??
        DEFAULT_CONFIG.publishing.dailyResetUtcHour,
      randomDelayMinMs:
        publishing.randomDelayMinMs ??
        DEFAULT_CONFIG.publishing.randomDelayMinMs,
      randomDelayMaxMs:
        publishing.randomDelayMaxMs ??
        DEFAULT_CONFIG.publishing.randomDelayMaxMs,
      llmMaxAttempts:
        publishing.llmMaxAttempts ?? DEFAULT_CONFIG.publishing.llmMaxAttempts,
    });
  }
}
