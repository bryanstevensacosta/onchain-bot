import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DexterBotConfigService } from './settings/infrastructure/config/bot.config';
import { TelegramBotClient } from './telegram/infrastructure/telegram/bot-client';
import { TradeButtonRegistry } from './telegram/infrastructure/keyboard/trade-button-registry';
import { InlineKeyboardBuilder } from './telegram/infrastructure/keyboard/inline-keyboard.builder';
import { MessageFormatterAdapter } from './scan/infrastructure/formatter/message-formatter';
import { MarketDataClient } from './scan/infrastructure/market-data/market-data.client';
import { TokenScanPipeline } from './scan/application/pipeline/token-scan.pipeline';
import { SCAN_PIPELINE } from './scan/domain/ports/scan-pipeline.port';
import { DexterController } from './telegram/api/http/dexter.controller';
import { DexterWebhookController } from './telegram/api/http/webhook.controller';
import { UpdatePollerService } from './telegram/application/poller/update-poller.service';
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

/**
 * DexterModule (Tramo 3, todo 13 — hexagonal composition root, P13).
 *
 * Single wiring module over four hexagonal sub-BCs (folders, not nested
 * Nest modules — commands ⇄ telegram depend on each other through the
 * router, so a single composition root avoids forwardRef cycles):
 *
 * - commands/ (domain ports + application router/handlers/context/rate-limit)
 * - scan/ (domain detector/extractor/ports + application pipeline +
 *   infrastructure market-data/formatter)
 * - telegram/ (domain telegram port + application poller + api
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
 */
@Module({
  imports: [HttpModule],
  controllers: [DexterController, DexterWebhookController],
  providers: [
    DexterBotConfigService,
    TelegramBotClient,
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
  ],
  exports: [
    DexterBotConfigService,
    TelegramBotClient,
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
