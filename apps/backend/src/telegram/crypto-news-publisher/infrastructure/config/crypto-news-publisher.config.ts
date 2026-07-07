import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * JSON shape of `config/crypto-news-publisher.config.json`.
 *
 * The defaults below mirror the plan's spec (§T5 of
 * `.omo/plans/crypto-news-publisher.md`). All fields are optional in
 * the on-disk file; missing fields fall back to the defaults.
 */
export interface CryptoNewsPublisherConfigJson {
  enabled?: boolean;
  targetChannel?: string;
  publishing?: {
    dailyCap?: number;
    dailyResetUtcHour?: number;
    randomDelayMinMs?: number;
    randomDelayMaxMs?: number;
    llmMaxAttempts?: number;
  };
  prompt?: {
    model?: string;
    template?: string;
  };
}

export interface CryptoNewsPublisherConfig {
  readonly enabled: boolean;
  readonly targetChannel: string;
  readonly publishing: {
    readonly dailyCap: number;
    readonly dailyResetUtcHour: number;
    readonly randomDelayMinMs: number;
    readonly randomDelayMaxMs: number;
    readonly llmMaxAttempts: number;
  };
  readonly prompt: {
    readonly model: string;
    readonly template: string;
  };
}

const CONFIG_PATH = join(
  process.cwd(),
  'config',
  'crypto-news-publisher.config.json',
);

/**
 * Hard-coded defaults. Exported so the bootstrap migration
 * (`LlmConfigMigrationService`) can seed `LlmConfig` + a
 * `PromptTemplate` with the same values when the on-disk JSON file
 * is absent — single source of truth across the two paths. Frozen
 * to make accidental mutation a noisy TypeError.
 */
export const DEFAULT_CONFIG: CryptoNewsPublisherConfig = Object.freeze({
  enabled: false,
  targetChannel: '',
  publishing: Object.freeze({
    dailyCap: 36,
    dailyResetUtcHour: 4,
    randomDelayMinMs: 180_000,
    randomDelayMaxMs: 900_000,
    llmMaxAttempts: 3,
  }),
  prompt: Object.freeze({
    model: 'opencode-zen/deepseek-v4-flash',
    template:
      'Reformula la siguiente noticia crypto en español profesional y conciso (<500 chars). El post incluye imagen adjunta: {{hasImage}}.\n\n' +
      'Título: {{title}}\n\n' +
      'Contenido original: {{original}}\n\n' +
      'Genera un post atractivo con un emoji relevante al inicio.',
  }),
});

function loadFromDisk(): CryptoNewsPublisherConfigJson | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(
      readFileSync(CONFIG_PATH, 'utf-8'),
    ) as CryptoNewsPublisherConfigJson;
  } catch {
    return null;
  }
}

/**
 * Pure function: read the JSON config (if present) and merge with the
 * defaults. Exported so the ThrottleSchedulerService and the
 * ProcessNextQueuedArticleUseCase can both read the same snapshot
 * (no module-singleton state — easier to test).
 *
 * Falls back to `DEFAULT_CONFIG` when the file is missing or
 * unparseable — Wave 1 keeps the cron publisher functional before
 * T2 swaps it to read from `LlmConfigRepository` directly.
 */
export function loadCryptoNewsPublisherConfig(): CryptoNewsPublisherConfig {
  const fileConfig = loadFromDisk();
  if (!fileConfig) {
    return DEFAULT_CONFIG;
  }
  return {
    enabled: fileConfig.enabled ?? DEFAULT_CONFIG.enabled,
    targetChannel: fileConfig.targetChannel ?? DEFAULT_CONFIG.targetChannel,
    publishing: {
      dailyCap:
        fileConfig.publishing?.dailyCap ?? DEFAULT_CONFIG.publishing.dailyCap,
      dailyResetUtcHour:
        fileConfig.publishing?.dailyResetUtcHour ??
        DEFAULT_CONFIG.publishing.dailyResetUtcHour,
      randomDelayMinMs:
        fileConfig.publishing?.randomDelayMinMs ??
        DEFAULT_CONFIG.publishing.randomDelayMinMs,
      randomDelayMaxMs:
        fileConfig.publishing?.randomDelayMaxMs ??
        DEFAULT_CONFIG.publishing.randomDelayMaxMs,
      llmMaxAttempts:
        fileConfig.publishing?.llmMaxAttempts ??
        DEFAULT_CONFIG.publishing.llmMaxAttempts,
    },
    prompt: {
      model: fileConfig.prompt?.model ?? DEFAULT_CONFIG.prompt.model,
      template: fileConfig.prompt?.template ?? DEFAULT_CONFIG.prompt.template,
    },
  };
}

/**
 * NestJS-injectable wrapper around `loadCryptoNewsPublisherConfig()`.
 * Holds the loaded config as a readonly field so consumers can inject
 * it as a service rather than calling the function directly.
 */
@Injectable()
export class CryptoNewsPublisherConfigService {
  private readonly logger = new Logger(CryptoNewsPublisherConfigService.name);
  public readonly config: CryptoNewsPublisherConfig;

  public constructor() {
    this.config = loadCryptoNewsPublisherConfig();
    this.logger.log(
      `crypto-news-publisher config loaded: enabled=${this.config.enabled} ` +
        `dailyCap=${this.config.publishing.dailyCap} ` +
        `delayMs=[${this.config.publishing.randomDelayMinMs},${this.config.publishing.randomDelayMaxMs}]`,
    );
  }
}
