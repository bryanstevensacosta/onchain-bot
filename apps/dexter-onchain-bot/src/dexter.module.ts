import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataSource } from 'typeorm';
import { isDatabaseEnabled } from './shared/database/database.module';
import { DexterBotConfigService } from './settings/infrastructure/config/bot.config';
import { TelegramBotClient } from './gateway/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from './gateway/infrastructure/keyboard/trade-button-registry';
import { InlineKeyboardBuilder } from './gateway/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from './scan/infrastructure/formatter/message-formatter';
import { MarketDataClient } from './scan/infrastructure/market-data/market-data.client';
import { TokenScanPipeline } from './scan/application/pipeline/token-scan.pipeline';
import { SCAN_PIPELINE } from './scan/domain/ports/scan-pipeline.port';
import { DexterController } from './gateway/api/http/dexter.controller';
import { DexterWebhookController } from './gateway/api/http/webhook.controller';
import { UpdatePollerService } from './gateway/application/poller/update-poller.service';
import { DualSendParityService } from './gateway/application/services/dual-send-parity.service';
import { MigrateBotsToGatewayUseCase } from './gateway/application/use-cases/migrate-bots-to-gateway.use-case';
import { DexterBotBindingService } from './gateway/application/dexter-bot-binding.service';
import { GatewayHmacSigner } from './gateway/infrastructure/gateway/gateway-hmac-signer.service';
import { GatewayBotMappingService } from './gateway/infrastructure/gateway/gateway-bot-mapping.service';
import { GatewaySendClient } from './gateway/infrastructure/gateway/gateway-send-client.service';
import { BotsGatewaySenderPort } from './gateway/domain/ports/bots-gateway-sender.port';
import { GatewayMigrationController } from './gateway/api/http/gateway-migration.controller';
import { DexterBotBindingController } from './gateway/api/http/bot-binding.controller';
import { DexterIngressController } from './gateway/api/http/ingress.controller';
import { DisplayMapsController } from './templates/api/http/display-maps.controller';
import { TemplatePreviewController } from './templates/api/http/template-preview.controller';
import { PlaceholdersController } from './placeholders/api/http/placeholders.controller';
import {
  PreviewTemplateUseCase,
  type PreviewScanPipeline,
} from './templates/application/preview-template.use-case';
import {
  DISPLAY_RESOLVER,
  TemplateRendererService,
} from './placeholders/application/template-renderer.service';
import { MessageTemplatesController } from './templates/api/http/message-templates.controller';
import { DisplayResolverService } from './templates/application/display-resolver.service';
import { DisplayMapRepository } from './templates/domain/ports/display-map.repository';
import { InMemoryDisplayMapRepository } from './templates/infrastructure/persistence/in-memory/in-memory-display-map.repository';
import { TypeOrmDisplayMapRepository } from './templates/infrastructure/persistence/typeorm/repositories/typeorm-display-map.repository';
import { InMemoryMessageTemplateRepository } from './templates/infrastructure/persistence/in-memory/in-memory-message-template.repository';
import { TypeOrmMessageTemplateRepository } from './templates/infrastructure/persistence/typeorm/repositories/typeorm-message-template.repository';
import { MessageTemplateSeedService } from './templates/infrastructure/seed/message-template-seed.service';
import {
  MESSAGE_TEMPLATE_REPOSITORY,
  type MessageTemplateRepository,
} from './templates/domain/ports/message-template.repository';
import {
  InMemoryChatGroupRepository,
  InMemoryChatSettingsRepository,
} from './settings/infrastructure/repositories/in-memory.repositories';
import { ChatSettingsService } from './settings/application/chat-settings.service';
import { ContextResolverService } from './commands/application/context/context-resolver.service';
import { CommandRouterService } from './commands/application/router/command-router.service';
import { BareAddressHandler } from './commands/application/handlers/bare-address.handler';
import { UserRateLimiter } from './commands/application/rate-limit/user-rate-limiter';
import {
  StartCommandHandler,
  HelpCommandHandler,
} from './commands/application/handlers/start.handler';
import { CaScanHandler } from './commands/application/handlers/ca.handler';
import { XTokenScanHandler } from './commands/application/handlers/x-token-scan.handler';
import { ZCompactScanHandler } from './commands/application/handlers/z-compact-scan.handler';
import { CTokenChartHandler } from './commands/application/handlers/c-token-chart.handler';
import { CcChartOnlyHandler } from './commands/application/handlers/cc-chart-only.handler';
import { TbTradeButtonsHandler } from './commands/application/handlers/tb-trade-buttons.handler';
import { SettingsViewHandler } from './commands/application/handlers/settings-view.handler';
import type {
  ChatGroupRepository,
  ChatSettingsRepository,
} from './settings/domain/chat-settings';

export const CHAT_GROUP_REPOSITORY = Symbol('CHAT_GROUP_REPOSITORY');
export const CHAT_SETTINGS_REPOSITORY = Symbol('CHAT_SETTINGS_REPOSITORY');
export { SCAN_PIPELINE };

function requireDataSourceOrThrow(): never {
  throw new Error(
    '[dexter-db] DATABASE_ENABLED=true but no DataSource is initialized — ' +
      'DatabaseModule did not connect (check DATABASE_URL and that postgres is reachable).',
  );
}

function resolveDisplayMapRepository(
  memory: InMemoryDisplayMapRepository,
  dataSource?: DataSource,
): DisplayMapRepository {
  if (!isDatabaseEnabled()) {
    return memory;
  }
  if (!dataSource) {
    return requireDataSourceOrThrow();
  }
  return new TypeOrmDisplayMapRepository(dataSource);
}

function resolveMessageTemplateRepository(
  memory: InMemoryMessageTemplateRepository,
  dataSource?: DataSource,
): MessageTemplateRepository {
  if (!isDatabaseEnabled()) {
    return memory;
  }
  if (!dataSource) {
    return requireDataSourceOrThrow();
  }
  return new TypeOrmMessageTemplateRepository(dataSource);
}

/**
 * DexterModule (Tramo 3, todo 13 — hexagonal composition root, P13).
 *
 * Single wiring module over four hexagonal sub-BCs (folders, not nested
 * Nest modules — commands ⇄ gateway depend on each other through the
 * router, so a single composition root avoids forwardRef cycles):
 *
 * - commands/ (domain ports + application router/handlers/context/rate-limit)
 * - scan/ (domain detector/extractor/ports + application pipeline +
 *   infrastructure market-data/formatter)
 * - gateway/ (domain telegram port + application poller + api
 *   webhook/lookup + infrastructure client/keyboard/registry)
 * - settings/ (domain chat-settings + application service +
 *   infrastructure config/in-memory repos)
 *
 * Wires the moved chain-dexter-bot graph onto market-data HTTP:
 * CommandRouterService + commands (/start rewritten, /ca new,
 * /x /z /c /cc /tb /settings inherited) + TokenScanPipeline.resolve
 * (market-data HTTP, todo 5 bridge default-true) + formatter +
 * TradeButtonRegistry + per-chat settings + poller/webhook ingress.
 * Per-user rate limit enforced in the router (all paths) and again at
 * the webhook edge. Lookup-only: no channel publishing, no
 * scoring/tracking imports anywhere in this module.
 *
 * Gateway migration (telegram-bots-gateway todo 6): `sendMessage` runs
 * `DEXTER_SEND_MODE` (`direct` legacy | `dual` both legs + parity |
 * `gateway` vault-id only). `GatewaySendClient` (behind
 * `BotsGatewaySenderPort`) carries the gateway leg with vault ids only;
 * `MigrateBotsToGatewayUseCase` (+ `POST
 * /api/dexter-bots/migrate-to-gateway`) registers the env token once;
 * `DexterIngressController` (`POST /dexter/ingress`) accepts the
 * gateway router fan-out into the same command router. Mode stays
 * `dual` — no cutover in this todo.
 */
@Module({
  imports: [HttpModule],
  controllers: [
    DexterController,
    DexterWebhookController,
    GatewayMigrationController,
    DexterBotBindingController,
    DexterIngressController,
    // todo 8 (dexter-message-templates): display-maps CRUD. Additive only —
    // the full templates/placeholders wiring (TypeORM switch,
    // DISPLAY_RESOLVER binding, seed) lands in todo 13.
    DisplayMapsController,
    // todo 6 (dexter-message-templates): message-templates CRUD + activate.
    // Additive only — the TypeORM switch behind MESSAGE_TEMPLATE_REPOSITORY
    // lands in todo 13 (same useExisting shape as the display-maps pair).
    MessageTemplatesController,
    // todo 7 (dexter-message-templates): dry-run preview + placeholder
    // catalog. Additive only — same in-memory bindings as todos 6/8.
    TemplatePreviewController,
    PlaceholdersController,
  ],
  providers: [
    DexterBotConfigService,
    TelegramBotClient,
    GatewayHmacSigner,
    GatewayBotMappingService,
    GatewaySendClient,
    {
      provide: BotsGatewaySenderPort,
      useExisting: GatewaySendClient,
    },
    DualSendParityService,
    MigrateBotsToGatewayUseCase,
    DexterBotBindingService,
    TradeButtonRegistry,
    InlineKeyboardBuilder,
    MessageFormatterAdapter,
    MarketDataClient,
    {
      provide: SCAN_PIPELINE,
      useClass: TokenScanPipeline,
    },
    {
      provide: TokenScanPipeline,
      useExisting: SCAN_PIPELINE,
    },
    InMemoryChatGroupRepository,
    InMemoryChatSettingsRepository,
    {
      provide: CHAT_GROUP_REPOSITORY,
      useExisting: InMemoryChatGroupRepository,
    },
    {
      provide: CHAT_SETTINGS_REPOSITORY,
      useExisting: InMemoryChatSettingsRepository,
    },
    {
      provide: ChatSettingsService,
      useFactory: (
        groups: ChatGroupRepository,
        settings: ChatSettingsRepository,
        registry: TradeButtonRegistry,
      ): ChatSettingsService =>
        new ChatSettingsService(groups, settings, registry),
      inject: [
        CHAT_GROUP_REPOSITORY,
        CHAT_SETTINGS_REPOSITORY,
        TradeButtonRegistry,
      ],
    },
    {
      provide: ContextResolverService,
      useFactory: (
        groups: ChatGroupRepository,
        chatSettings: ChatSettingsService,
      ): ContextResolverService =>
        new ContextResolverService(groups, chatSettings),
      inject: [CHAT_GROUP_REPOSITORY, ChatSettingsService],
    },
    {
      provide: UserRateLimiter,
      useFactory: (config: DexterBotConfigService): UserRateLimiter =>
        new UserRateLimiter(config.get().commandRateLimitPerUser),
      inject: [DexterBotConfigService],
    },
    BareAddressHandler,
    StartCommandHandler,
    HelpCommandHandler,
    CaScanHandler,
    XTokenScanHandler,
    ZCompactScanHandler,
    CTokenChartHandler,
    CcChartOnlyHandler,
    TbTradeButtonsHandler,
    SettingsViewHandler,
    {
      provide: CommandRouterService,
      useFactory: (
        contextResolver: ContextResolverService,
        bot: TelegramBotClient,
        chatSettings: ChatSettingsService,
        keyboards: InlineKeyboardBuilder,
        rateLimiter: UserRateLimiter,
        fallback: BareAddressHandler,
        start: StartCommandHandler,
        help: HelpCommandHandler,
        ca: CaScanHandler,
        x: XTokenScanHandler,
        z: ZCompactScanHandler,
        c: CTokenChartHandler,
        cc: CcChartOnlyHandler,
        tb: TbTradeButtonsHandler,
        settings: SettingsViewHandler,
      ): CommandRouterService =>
        new CommandRouterService(
          contextResolver,
          bot,
          chatSettings,
          keyboards,
          rateLimiter,
          fallback,
          start,
          help,
          ca,
          x,
          z,
          c,
          cc,
          tb,
          settings,
        ),
      inject: [
        ContextResolverService,
        TelegramBotClient,
        ChatSettingsService,
        InlineKeyboardBuilder,
        UserRateLimiter,
        BareAddressHandler,
        StartCommandHandler,
        HelpCommandHandler,
        CaScanHandler,
        XTokenScanHandler,
        ZCompactScanHandler,
        CTokenChartHandler,
        CcChartOnlyHandler,
        TbTradeButtonsHandler,
        SettingsViewHandler,
      ],
    },
    UpdatePollerService,
    // todo 13 final persistence switch (TypeORM when DATABASE_ENABLED=true,
    // in-memory otherwise). Same `useExisting`-equivalent shape as the
    // interim todos 6/8 bindings, but resolved through a factory: the
    // TypeORM adapters need `DataSource` (only present when
    // `DatabaseModule.forRootFromEnv()` initialized TypeORM), so they are
    // constructed inside the factory instead of being listed as class
    // providers (a class provider would crash boot in in-memory mode
    // asking for a missing DataSource). `DataSource` injects as
    // `{token, optional:true}`; enabled-but-absent fails boot FAST with a
    // readable error (no hang). Single shared instance per token either way.
    InMemoryDisplayMapRepository,
    {
      provide: DisplayMapRepository,
      useFactory: (
        memory: InMemoryDisplayMapRepository,
        dataSource?: DataSource,
      ): DisplayMapRepository =>
        resolveDisplayMapRepository(memory, dataSource),
      inject: [
        InMemoryDisplayMapRepository,
        { token: DataSource, optional: true },
      ],
    },
    DisplayResolverService,
    // The renderer is constructed resolver-less (`@Optional()` ctor) but
    // this binding wires its `DISPLAY_RESOLVER` slot to the live
    // `DisplayResolverService` — so `{{chainDisplay}}` renders real mapped
    // values over HTTP (in BOTH modes; in-memory starts with an empty
    // catalog → `""` until rows are created via the API, no reboot needed
    // thanks to refresh-on-write + the boot warmup below).
    {
      provide: DISPLAY_RESOLVER,
      useExisting: DisplayResolverService,
    },
    InMemoryMessageTemplateRepository,
    {
      provide: MESSAGE_TEMPLATE_REPOSITORY,
      useFactory: (
        memory: InMemoryMessageTemplateRepository,
        dataSource?: DataSource,
      ): MessageTemplateRepository =>
        resolveMessageTemplateRepository(memory, dataSource),
      inject: [
        InMemoryMessageTemplateRepository,
        { token: DataSource, optional: true },
      ],
    },
    // todo 9 seed (idempotent catalog seed on bootstrap + trailing
    // DisplayResolverService.refresh() in the SAME hook — explicit
    // seed-then-refresh, no second hook to race. DisplayMap rows stay
    // operator/API-owned — templates only here).
    MessageTemplateSeedService,
    // todo 7 preview wiring (same in-memory bindings as todos 6/8; the
    // use-case takes the interface port, so useFactory carries the
    // explicit inject array — same shape as ChatSettingsService above).
    TemplateRendererService,
    {
      provide: PreviewTemplateUseCase,
      useFactory: (
        pipeline: PreviewScanPipeline,
        templates: MessageTemplateRepository,
        renderer: TemplateRendererService,
        displays: DisplayResolverService,
      ): PreviewTemplateUseCase =>
        new PreviewTemplateUseCase(pipeline, templates, renderer, displays),
      inject: [
        SCAN_PIPELINE,
        MESSAGE_TEMPLATE_REPOSITORY,
        TemplateRendererService,
        DisplayResolverService,
      ],
    },
  ],
  exports: [
    DexterBotConfigService,
    TelegramBotClient,
    BotsGatewaySenderPort,
    DualSendParityService,
    TradeButtonRegistry,
    InlineKeyboardBuilder,
    MessageFormatterAdapter,
    MarketDataClient,
    ChatSettingsService,
    ContextResolverService,
    CommandRouterService,
  ],
})
export class DexterModule {}
