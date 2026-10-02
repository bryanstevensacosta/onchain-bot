import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import type { MessageTemplateCommand } from '@/templates/domain/message-template.validators';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from '@/templates/domain/ports/message-template.repository';
import { DisplayResolverService } from '@/templates/application/display-resolver.service';
import { MessageTemplateDuplicateError } from '@/templates/infrastructure/persistence/message-template.errors';
import {
  isKnownPlaceholder,
  TEMPLATE_COMMANDS,
} from '@/placeholders/domain/placeholder-registry';

export interface MessageTemplateSeedDefinition {
  readonly command: MessageTemplateCommand;
  readonly name: string;
  readonly bodyMarkdown: string;
}

export interface MessageTemplateSeedResult {
  readonly created: number;
  readonly skipped: number;
  readonly activeEnsured: number;
}

/**
 * Full scan card (MarkdownV2, escape delegated to the renderer).
 *
 * Anatomy: `docs/examples-for-dexter/rick-bot-scanner.md` (card rows:
 * header + contract + price/MC/liq + supplies + holders/dev + links +
 * trade) under the `format-comparison.md` decision (parse from entities
 * JSON, store raw+entities, render MarkdownV2 for bot sends). Own
 * layout — mirrors `MessageFormatterAdapter.formatScanCard` rows as
 * placeholders, not a copy of any observed bot card. Static text style
 * (`|`/`()` raw) matches the todo-7 preview spec precedent; every
 * substituted VALUE is `escapeV2`-escaped exactly once by the renderer.
 */
const FULL_DEXTER_BODY = [
  '{{chainDisplay}} ${{symbol}} | {{name}} — {{chain}}',
  '`{{address}}`',
  '',
  '💰 {{priceUsd}} ({{priceChange24h}}) • MC {{marketCapUsd}} • Liq {{liquidityUsd}}',
  '📦 FDV {{fdvUsd}} • Total {{totalSupply}} • Circulating {{circulatingSupply}} • Max {{maxSupply}}',
  '👥 Holders {{holders}} • Top 10 {{top10HolderPercent}} • {{devLine}}',
  '🔗 {{scanLinks}}',
  '🤖 {{tradeHint}}',
].join('\n');

/**
 * Compact card, Proficy style (`examples-vendored.md` @ProficyPriceBot:
 * head + Price/Volume/B-S rows + MC/Liq/Age row): price/vol + MC/liq.
 */
const COMPACT_RICK_BODY = [
  '${{symbol}} | {{name}} — {{chain}}',
  '💰 {{priceUsd}} ({{priceChange24h}}) • Vol {{volume24hUsd}}',
  'MC {{marketCapUsd}} • Liq {{liquidityUsd}}',
  '`{{address}}`',
].join('\n');

/**
 * 2-line compact card: migration of the legacy
 * `MessageFormatterAdapter.formatCompact` (`💊 $symbol | name` + price
 * row) to MarkdownV2 placeholders.
 */
const Z_COMPACT_BODY = [
  '${{symbol}} | {{name}}',
  '💰 {{priceUsd}} ({{priceChange24h}}) • MC {{marketCapUsd}}',
].join('\n');

/**
 * Chart cards (`c`/`cc`) are TEXT-ONLY with links by design: no
 * `reply_markup` keyboard (the gateway `SendDto` has none) — the chart
 * travels as inline MarkdownV2 links. `{{timeframe}}` is valid ONLY in
 * `c`/`cc` bodies (registry-enforced).
 */
const CHART_BODY = [
  '📈 Chart ({{timeframe}}): {{dexscreenerUrl}}',
  '🔗 {{scanLinks}}',
].join('\n');

/**
 * Initial template catalog (7 rows, 6 commands). Derived key is
 * `{{chainDisplay}}` (DisplayMap-backed, `""` with an empty catalog —
 * covered by the renderer); there is no `chainEmoji` placeholder.
 */
export const MESSAGE_TEMPLATE_SEEDS: readonly MessageTemplateSeedDefinition[] =
  [
    { command: 'ca', name: 'full-dexter-v1', bodyMarkdown: FULL_DEXTER_BODY },
    {
      command: 'ca',
      name: 'compact-rick-v1',
      bodyMarkdown: COMPACT_RICK_BODY,
    },
    { command: 'x', name: 'full-dexter-v1', bodyMarkdown: FULL_DEXTER_BODY },
    { command: 'z', name: 'compact-v1', bodyMarkdown: Z_COMPACT_BODY },
    { command: 'c', name: 'chart-v1', bodyMarkdown: CHART_BODY },
    { command: 'cc', name: 'chart-only-v1', bodyMarkdown: CHART_BODY },
    { command: 'bare', name: 'bare-ca-v1', bodyMarkdown: FULL_DEXTER_BODY },
  ];

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

const extractPlaceholderKeys = (body: string): string[] => {
  const keys = new Set<string>();
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_PATTERN.exec(body)) !== null) {
    keys.add(match[1]);
  }
  return [...keys];
};

/**
 * Idempotent initial seed for the message-template catalog (todo 9,
 * dexter-message-templates).
 *
 * - Keyed on `(command, name)`: a seed whose row already exists is a
 *   no-op; a second boot creates 0 rows.
 * - Activation only fills a vacuum: the FIRST seed of a command is
 *   activated only when the command has NO active template — a re-boot
 *   never steals an operator's active choice.
 * - Runs in `onApplicationBootstrap` ONLY when
 *   `DEXTER_SEED_TEMPLATES=true` (unset/empty defaults to true in dev;
 *   explicit `'false'` skips silently with a log line).
 * - Ends with `DisplayResolverService.refresh()` (todo 13): the SAME
 *   hook awaits seed-then-refresh, so no second hook can race it (Nest
 *   runs same-module bootstrap hooks concurrently — a separate warmup
 *   hook double-ran the seed with noisy duplicate errors, proven live).
 *   The resolver is `@Optional()` so direct spec construction
 *   (`new MessageTemplateSeedService(repo)`) keeps compiling.
 * - A seed body that fails placeholder validation does NOT crash boot:
 *   it is logged (error) and skipped, the rest still seed.
 * - DisplayMap rows are NOT seeded here (operator/API concern — the
 *   renderer tolerates an empty catalog for `{{chainDisplay}}`).
 */
@Injectable()
export class MessageTemplateSeedService {
  private readonly logger = new Logger(MessageTemplateSeedService.name);

  public constructor(
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    private readonly templates: MessageTemplateRepository,
    @Optional()
    private readonly displays?: DisplayResolverService,
  ) {}

  public static isSeedEnabled(): boolean {
    const raw = process.env.DEXTER_SEED_TEMPLATES;
    if (raw === undefined || raw.trim() === '') {
      return true;
    }
    return raw.trim().toLowerCase() === 'true';
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (!MessageTemplateSeedService.isSeedEnabled()) {
      this.logger.log(
        'DEXTER_SEED_TEMPLATES is not true — template seed skipped',
      );
      return;
    }
    const result = await this.runOnce(MESSAGE_TEMPLATE_SEEDS);
    this.logger.log(
      `template seed done: created=${result.created} skipped=${result.skipped} activeEnsured=${result.activeEnsured}`,
    );
    await this.displays?.refresh();
    if (this.displays) {
      this.logger.log('display-resolver cache warmed (seed-then-refresh)');
    }
  }

  /**
   * Seeds `seeds` (default: the built-in catalog). Public with an
   * injectable seed list so specs can prove the typo-skip path without
   * touching the built-in rows.
   */
  public async runOnce(
    seeds: readonly MessageTemplateSeedDefinition[] = MESSAGE_TEMPLATE_SEEDS,
  ): Promise<MessageTemplateSeedResult> {
    let created = 0;
    let skipped = 0;
    for (const seed of seeds) {
      const siblings = await this.templates.findByCommand(seed.command);
      if (siblings.some((t) => t.name === seed.name)) {
        continue;
      }
      if (!this.isSeedBodyUsable(seed)) {
        skipped += 1;
        continue;
      }
      try {
        const template = MessageTemplate.create({
          command: seed.command,
          name: seed.name,
          bodyMarkdown: seed.bodyMarkdown,
        });
        await this.templates.save(template);
        created += 1;
      } catch (error) {
        // Best-effort seed: one bad row (validation, duplicate race)
        // must never abort boot or the remaining seeds.
        this.logger.error(
          `template seed (${seed.command}, ${seed.name}) failed — skipped: ${(error as Error).message}`,
        );
        skipped += 1;
      }
    }
    let activeEnsured = 0;
    for (const command of TEMPLATE_COMMANDS) {
      const first = seeds.find((s) => s.command === command);
      if (!first) {
        continue;
      }
      const active = await this.templates.findActiveByCommand(command);
      if (active) {
        continue;
      }
      const target = (await this.templates.findByCommand(command)).find(
        (t) => t.name === first.name,
      );
      if (!target) {
        // Its seed was skipped (invalid body) — nothing to activate.
        continue;
      }
      await this.activateWithoutStealing(target);
      activeEnsured += 1;
    }
    return { created, skipped, activeEnsured };
  }

  private isSeedBodyUsable(seed: MessageTemplateSeedDefinition): boolean {
    if (seed.bodyMarkdown.includes('{%') || seed.bodyMarkdown.includes('{{#')) {
      this.logger.error(
        `template seed (${seed.command}, ${seed.name}) uses unsupported syntax — skipped`,
      );
      return false;
    }
    const unknown = extractPlaceholderKeys(seed.bodyMarkdown).filter(
      (key) => !isKnownPlaceholder(seed.command, key),
    );
    if (unknown.length > 0) {
      this.logger.error(
        `template seed (${seed.command}, ${seed.name}) has unknown placeholders [${unknown.join(', ')}] — skipped`,
      );
      return false;
    }
    return true;
  }

  /**
   * Same activate semantics as
   * `MessageTemplatesController.doActivate` (deactivate-others +
   * `activate() + bumpVersion()`): the entity `activate()` alone does
   * NOT version++. Only called when the command has no active template.
   */
  private async activateWithoutStealing(
    target: MessageTemplate,
  ): Promise<void> {
    const siblings = await this.templates.findByCommand(target.command);
    for (const sibling of siblings) {
      if (sibling.id !== target.id && sibling.isActive) {
        sibling.deactivate();
        await this.templates.save(sibling);
      }
    }
    // activate() toggles the flag only (no version bump by design) —
    // the seed composes the version++ explicitly (MUST DO).
    target.activate();
    target.bumpVersion();
    try {
      await this.templates.save(target);
    } catch (error) {
      if (error instanceof MessageTemplateDuplicateError) {
        // Lost an activate race (partial unique index / in-memory
        // guard): the winner is already active — vacuum filled.
        return;
      }
      throw error;
    }
  }
}
