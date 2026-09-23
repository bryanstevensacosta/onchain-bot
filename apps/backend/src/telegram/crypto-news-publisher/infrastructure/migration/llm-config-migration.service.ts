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
 *
 * **Hardened-template refresh (v3, 2026-09-16; v2 fue 2026-09-15).** `seedIfEmpty` alone
 * never touches existing rows, so the prod `Default` template (edited
 * 2026-08-28, system pide "line breaks" sin exigir `\n` literal ni
 * prohibir `<br>` → SpendLogs 07d35fbb: el modelo emitió 11×`<br>`
 * con 0×`\n`) would keep the weak prompt forever. On every boot AFTER
 * the seed check, `refreshOutdatedTemplates()` rewrites any seed-owned
 * row (`Default` / `Default (imported)`) whose `systemPromptText`
 * lacks the hardened marker (`PROHIBIDO \`<br>\` v3`) with the current
 * seeds. v3 = revisión de adaptación libre (cero estructura
 * obligatoria): el prompt v2 con estructura obligatoria provocó
 * alucinaciones para rellenar
 * (canal -1001375055530 msg 19618: cierre inventado sin mención
 * crypto en el input + `Fuente: <omitir|omitir|omitir>` eco literal).
 * Las filas v2 (marcador sin sufijo ` v3`) se reescriben UNA vez;
 * las v3 se omiten. DECISIÓN DOCUMENTADA: UPDATE por marcador de contenido
 * (content-hash ligero), NO por columna de versión — `PromptTemplate`
 * no tiene columna `version` y añadir una migración TypeORM solo para
 * esto rompería el invariante "cero writes fuera de código" de esta
 * tarea; el marcador es idempotente y sobrevive ediciones manuales
 * (una fila editada a mano que conserve el marcador NO se pisa).
 *
 * NOTA OPERATIVA (no corregir aquí, solo registrar):
 * - revisar `channel_content_filter_configs` en prod por si alguna
 *   regla `\s+`→`" "` colapsa los `\n\n` (hoy 0 filas para el canal:
 *   exonerado, pero re-verificar tras cada alta de canal).
 * - `generated_model` NULL en queue es el gap conocido de
 *   `publisher-queue.mapper.ts:29-33` (no mapea el campo) — gap
 *   aparte, no tocar en esta tarea.
 */
@Injectable()
export class LlmConfigMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LlmConfigMigrationService.name);

  private static readonly CONFIG_ROW_ID = 1;
  private static readonly MAX_TOKENS_DEFAULT = 2000;
  private static readonly TEMPERATURE_DEFAULT = 0.7;
  /**
   * Content marker identifying the hardened (v3) prompt format.
   * Exported so specs can assert seed/refresh consistency without
   * duplicating the literal. A seed-owned row lacking this marker in
   * its `systemPromptText` is considered outdated and gets rewritten
   * by `refreshOutdatedTemplates()`.
   *
   * v3 = revisión de adaptación libre (cero estructura obligatoria):
   * las filas v2 contienen `PROHIBIDO \`<br>\`` pero NO el sufijo ` v3`, así que se
   * reescriben UNA vez en el próximo boot; las filas que ya traen el
   * marcador v3 se omiten (idempotencia preservada).
   */
  public static readonly HARDENED_SYSTEM_MARKER = 'PROHIBIDO `<br>` v3';
  /**
   * Names owned by this seed. Only these rows are ever rewritten by
   * the refresh — operator-created templates are never touched.
   */
  public static readonly SEED_TEMPLATE_NAMES: ReadonlyArray<string> = [
    'Default',
    'Default (imported)',
  ];
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
      } else if (result.templateCount > 0) {
        this.logger.log(
          `[llm-config-migration] refreshed ${result.templateCount} outdated seed template(s) to the hardened format`,
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
   * When the row already exists, still runs the hardened-template
   * refresh so pre-v3 seed rows (e.g. prod `Default` with a v2 or weak
   * `systemPromptText`) converge to the current seeds;
   * `templateCount` then carries the number of refreshed rows.
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
      const cfg =
        providedJson ?? LlmConfigMigrationService.readJsonConfigOrNull();
      if (existing) {
        const refreshed =
          await LlmConfigMigrationService.refreshOutdatedTemplates(
            manager,
            cfg,
          );
        return { seeded: false, templateCount: refreshed };
      }
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
    const { promptText, systemPromptText } =
      LlmConfigMigrationService.resolveSeedTexts(cfg);
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
      systemPromptText,
    });
  }

  /**
   * Versioned refresh for pre-existing seed rows. Rewrites ONLY rows
   * named `Default` / `Default (imported)` whose `systemPromptText`
   * lacks `HARDENED_SYSTEM_MARKER`, setting both `promptText` and
   * `systemPromptText` to the current seeds (JSON when provided and
   * non-empty, in-code defaults otherwise). Additionally converges
   * `maxTokens` to `MAX_TOKENS_DEFAULT` on seed-owned rows whose
   * value is below the target (token-starvation fix: the hardened
   * prompt is much longer, so 1000 truncates/empties completions).
   * NEVER touches `model` / `temperature` / `reasoningEffort` — those
   * are operator-tuned. Returns the number of rows rewritten.
   * Operator-created templates are never touched.
   */
  public static async refreshOutdatedTemplates(
    manager: EntityManager,
    cfg: CryptoNewsPublisherConfigJson | null,
  ): Promise<number> {
    const candidates = await manager.find(PromptTemplateEntity, {
      where: LlmConfigMigrationService.SEED_TEMPLATE_NAMES.map((name) => ({
        name,
      })),
    });
    const { promptText, systemPromptText } =
      LlmConfigMigrationService.resolveSeedTexts(cfg);
    const targetMaxTokens = LlmConfigMigrationService.MAX_TOKENS_DEFAULT;
    let refreshed = 0;
    for (const row of candidates) {
      const system = row.systemPromptText ?? '';
      const needsTextRefresh = !system.includes(
        LlmConfigMigrationService.HARDENED_SYSTEM_MARKER,
      );
      const needsMaxTokensConverge = (row.maxTokens ?? 0) < targetMaxTokens;
      if (!needsTextRefresh && !needsMaxTokensConverge) {
        continue;
      }
      if (needsTextRefresh) {
        row.promptText = promptText;
        row.systemPromptText = systemPromptText;
      }
      if (needsMaxTokensConverge) {
        const before = row.maxTokens ?? 0;
        row.maxTokens = targetMaxTokens;
        new Logger(LlmConfigMigrationService.name).log(
          `[llm-config-migration] converged maxTokens for template "${row.name}" ${before} -> ${targetMaxTokens}`,
        );
      }
      await manager.save(row);
      refreshed += 1;
    }
    return refreshed;
  }

  /**
   * Resolve the seed prompt bodies: JSON values win when present and
   * non-blank, in-code defaults otherwise. Shared by `buildTemplate`
   * and `refreshOutdatedTemplates` so fresh seeds and refreshed rows
   * always carry identical text (cero drift).
   */
  private static resolveSeedTexts(cfg: CryptoNewsPublisherConfigJson | null): {
    promptText: string;
    systemPromptText: string;
  } {
    const promptText =
      cfg?.prompt?.template && cfg.prompt.template.trim().length > 0
        ? cfg.prompt.template
        : DEFAULT_CONFIG.prompt.template;
    const systemPromptText =
      cfg?.prompt?.systemTemplate && cfg.prompt.systemTemplate.trim().length > 0
        ? cfg.prompt.systemTemplate
        : DEFAULT_CONFIG.prompt.systemTemplate;
    return { promptText, systemPromptText };
  }

  /**
   * Build the seed `LlmConfig` (id = 1) using the JSON's publishing
   * block when present, falling back to the in-code defaults.
   */
  private static buildLlmConfig(
    cfg: CryptoNewsPublisherConfigJson | null,
    defaultTemplateId: string,
  ): LlmConfig {
    // The JSON file may still carry `enabled` from before it was split into flags.
    // Read it dynamically for migration and apply it to both remaining flags
    // (llm/publishing). Matching activation lives in crypto_news_matching_config
    // (backfilled by migration 1875000000000); the legacy llm_config
    // matching_enabled column was dropped in 1875000000002.
    const enabled =
      ((cfg as Record<string, unknown> | null)?.enabled as
        | boolean
        | undefined) ?? false;
    const targetChannel = cfg?.targetChannel ?? DEFAULT_CONFIG.targetChannel;
    const publishing = cfg?.publishing ?? {};
    return LlmConfig.load({
      id: LlmConfigMigrationService.CONFIG_ROW_ID,
      defaultTemplateId,
      targetChannel,
      llmEnabled: enabled,
      publishingEnabled: enabled,
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
