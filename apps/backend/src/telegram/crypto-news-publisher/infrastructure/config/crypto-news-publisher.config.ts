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
  targetChannel?: string;
  publishing?: {
    dailyCap?: number;
    dailyResetUtcHour?: number;
    randomDelayMinMs?: number;
    randomDelayMaxMs?: number;
    llmMaxAttempts?: number;
    mediaTtlDays?: number;
  };
  prompt?: {
    model?: string;
    template?: string;
    systemTemplate?: string;
  };
}

export interface CryptoNewsPublisherConfig {
  readonly targetChannel: string;
  readonly publishing: {
    readonly dailyCap: number;
    readonly dailyResetUtcHour: number;
    readonly randomDelayMinMs: number;
    readonly randomDelayMaxMs: number;
    readonly llmMaxAttempts: number;
    readonly mediaTtlDays: number;
  };
  readonly prompt: {
    readonly model: string;
    readonly template: string;
    readonly systemTemplate: string;
  };
}

const CONFIG_PATH = join(
  process.cwd(),
  'config',
  'crypto-news-publisher.config.json',
);

/**
 * Hardened seed prompts — single source of truth.
 *
 * Contexto operativo (SpendLogs 07d35fbb/chatcmpl-274): el system anterior
 * pedía "line breaks" sin mencionar `\n` literal ni prohibir `<br>`; el
 * modelo (gpt-oss:120b) razonó "use line breaks `<br>`", emitió 11×`<br>`
 * con 0×`\n`, y el sanitizer los borró dejando el post pegado. Estos seeds
 * son defensa en origen (la tarea hermana endurece el sanitizer a
 * `<br>`→`\n` pre-sanitize): el modelo NO debe emitir `<br>` nunca.
 *
 * Revisión v3 (adaptación libre, cero estructura obligatoria): con el
 * prompt v2 el modelo alucinó para rellenar estructura obligatoria —
 * publicó `Esto podría impactar los mercados cripto.` (inventado: el
 * input era una historia de tipos de la Fed sin mención crypto) y
 * `Fuente: <omitir|omitir|omitir>` (placeholder eco literal) en el
 * canal -1001375055530 msg 19618. El v3 condicional intermedio seguía
 * sonando robótico (sección de implicaciones forzada), así que NINGUNA
 * sección es obligatoria ahora: el modelo elige forma y longitud por
 * noticia (un párrafo corto o titular + línea son válidos) y adapta con
 * voz propia en vez de parafrasear. La regla anti-alucinación
 * (`PROHIBIDO inventar…`) y la línea `Fuente:` solo con URL/medio real
 * cierran la causa original.
 *
 * Exportados por separado para que `LlmConfigMigrationService` y el drift
 * test los reutilicen sin duplicar texto (cero drift por construcción).
 *
 * Nota `renderPrompt` (`crypto-news-llm.adapter.ts`): soporta HOY los tres
 * placeholders `{{title}}`, `{{original}}` y `{{hasImage}}` — por eso el
 * user template los usa los tres (verificado, no inventado).
 */
export const DEFAULT_SYSTEM_TEMPLATE =
  'Eres un redactor de noticias crypto que publica posts ORIGINALES en español natural y profesional. ' +
  'Responde SOLO con el cuerpo del post, sin explicaciones ni comillas envolventes.\n\n' +
  'ADAPTACIÓN LIBRE (cero estructura obligatoria):\n\n' +
  'No hay título obligatorio, ni número de párrafos, ni lista de bullets, ni cierre, ni línea de fuente obligatorios. ' +
  'El post puede ser un solo párrafo corto o un titular breve con una línea: TÚ eliges la forma según lo que la noticia pida. ' +
  'Reestructura con libertad — cambia el orden de las ideas, comprime, cuenta lo esencial con tus palabras. ' +
  'El post debe leerse como una pieza original, NO como paráfrasis pegada a la redacción del original.\n\n' +
  'Si la noticia trae varios datos que pidan lista, usa bullets `•` (un punto por línea, con línea en blanco entre cada bullet).\n\n' +
  'La línea `Fuente:` SOLO si el contenido original trae una URL o el nombre del medio; si no hay fuente, omite la línea entera (nunca escribas `omitir`, `N/A` ni marcadores).\n\n' +
  'FORMATO (HTML de Telegram, obligatorio):\n\n' +
  'El post se envía con parse_mode HTML: usa `<b>` para el titular y los datos clave, `<i>` para énfasis, ' +
  '`<u>`, `<s>`, `<code>`, `<a href="...">` para enlaces y `<blockquote>` para citas textuales. ' +
  'Esta es la ÚNICA sintaxis de formato permitida. ' +
  'Separa los bloques con `\\n\\n` (dos saltos de línea literales, nunca texto escapado ni etiquetas).\n\n' +
  'PROHIBIDO `<br>`, `<p>`, `</p>`, Markdown (`**`, `#`, `-`, `[]()`, `>`), CSS y cualquier etiqueta fuera de la lista anterior. ' +
  'Si necesitas un salto, usa `\\n\\n`, jamás una etiqueta. ' +
  '(Revisión v3: PROHIBIDO `<br>` v3.)\n\n' +
  'LONGITUD: conciso por defecto; tan largo como la noticia lo pida, tan corto como se pueda.\n\n' +
  'CONTENIDO:\n\n' +
  'Usa SOLO información del contenido original; preserva números, nombres, tickers y fechas tal cual. ' +
  'PROHIBIDO inventar datos, cifras, citas o implicaciones que no estén en el contenido original. ' +
  'Sin hashtags. Emoji permitido (uno como máximo, al inicio — no obligatorio). ' +
  'Solo HTML compatible con Telegram: `<b> <i> <u> <s> <code> <a>`.';

export const DEFAULT_USER_TEMPLATE =
  'Adapta la siguiente noticia crypto a un post ORIGINAL en español natural, con adaptación libre ' +
  '(cambia el orden, comprime, cuenta lo esencial con tus palabras; que NO parezca paráfrasis del original):\n\n' +
  'Sin estructura obligatoria: sin título forzado, sin número de párrafos, sin bullets obligatorios, sin cierre y sin línea de fuente obligatorios. ' +
  'Un solo párrafo corto o un titular breve con una línea son posts válidos si la noticia eso pide.\n\n' +
  'Si el original trae una URL o el nombre del medio, cierra con una línea Fuente: con esa URL o nombre tal cual; ' +
  'si no hay fuente, omite la línea (nunca escribas omitir, N/A ni marcadores).\n\n' +
  'Usa SOLO información del contenido original; preserva números, nombres, tickers y fechas tal cual. ' +
  'PROHIBIDO inventar datos, cifras, citas o implicaciones. ' +
  'PROHIBIDO `<br>`. Conciso por defecto; tan largo como la noticia lo pida, tan corto como se pueda.\n\n' +
  'Título original: {{title}}\n\n' +
  'El post incluye imagen adjunta: {{hasImage}}.\n\n' +
  'Contenido original:\n{{original}}';

/**
 * Hard-coded defaults. Exported so the bootstrap migration
 * (`LlmConfigMigrationService`) can seed `LlmConfig` + a
 * `PromptTemplate` with the same values when the on-disk JSON file
 * is absent — single source of truth across the two paths. Frozen
 * to make accidental mutation a noisy TypeError.
 */
export const DEFAULT_CONFIG: CryptoNewsPublisherConfig = Object.freeze({
  targetChannel: '',
  publishing: Object.freeze({
    dailyCap: 36,
    dailyResetUtcHour: 4,
    randomDelayMinMs: 180_000,
    randomDelayMaxMs: 900_000,
    llmMaxAttempts: 3,
    mediaTtlDays: 7,
  }),
  prompt: Object.freeze({
    model: 'opencode-zen/deepseek-v4-flash',
    template: DEFAULT_USER_TEMPLATE,
    systemTemplate: DEFAULT_SYSTEM_TEMPLATE,
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
function parseMediaTtlDays(value: string | undefined): number {
  if (value === undefined) return DEFAULT_CONFIG.publishing.mediaTtlDays;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return DEFAULT_CONFIG.publishing.mediaTtlDays;
  return Math.min(Math.max(parsed, 0), 365);
}

export function loadCryptoNewsPublisherConfig(): CryptoNewsPublisherConfig {
  const fileConfig = loadFromDisk();
  if (!fileConfig) {
    return DEFAULT_CONFIG;
  }
  return {
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
      mediaTtlDays: parseMediaTtlDays(
        process.env.PUBLISHER_MEDIA_TTL_DAYS ??
          String(fileConfig.publishing?.mediaTtlDays),
      ),
    },
    prompt: {
      model: fileConfig.prompt?.model ?? DEFAULT_CONFIG.prompt.model,
      template: fileConfig.prompt?.template ?? DEFAULT_CONFIG.prompt.template,
      systemTemplate:
        fileConfig.prompt?.systemTemplate ??
        DEFAULT_CONFIG.prompt.systemTemplate,
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
      `crypto-news-publisher config loaded: ` +
        `dailyCap=${this.config.publishing.dailyCap} ` +
        `delayMs=[${this.config.publishing.randomDelayMinMs},${this.config.publishing.randomDelayMaxMs}]`,
    );
  }
}
