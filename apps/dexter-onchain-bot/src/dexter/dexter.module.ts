import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DexterBotConfigService } from './bot.config';
import { TelegramBotClient } from './bot-client';
import { TradeButtonRegistry } from './trade-button-registry';
import { InlineKeyboardBuilder } from './inline-keyboard.builder';
import { MessageFormatterAdapter } from './message-formatter';
import { MarketDataClient } from './market-data.client';
import { TokenScanPipeline } from './token-scan.pipeline';
import { DexterController } from './dexter.controller';
import { DexterWebhookController } from './webhook.controller';
import { UpdatePollerService } from './update-poller.service';
import {
  InMemoryChatGroupRepository,
  InMemoryChatSettingsRepository,
} from './in-memory.repositories';
import { ChatSettingsService } from './chat-settings.service';
import { ContextResolverService } from './context-resolver.service';
import { CommandRouterService } from './command-router.service';
import { BareAddressHandler } from './bare-address.handler';
import { UserRateLimiter } from './rate-limiter';
import {
  StartCommandHandler,
  HelpCommandHandler,
} from './commands/start.handler';
import { CaScanHandler } from './commands/ca.handler';
import { XTokenScanHandler } from './commands/x-token-scan.handler';
import { ZCompactScanHandler } from './commands/z-compact-scan.handler';
import { CTokenChartHandler } from './commands/c-token-chart.handler';
import { CcChartOnlyHandler } from './commands/cc-chart-only.handler';
import { TbTradeButtonsHandler } from './commands/tb-trade-buttons.handler';
import { SettingsViewHandler } from './commands/settings-view.handler';
import type {
  ChatGroupRepository,
  ChatSettingsRepository,
} from './chat-settings';

export const CHAT_GROUP_REPOSITORY = Symbol('CHAT_GROUP_REPOSITORY');
export const CHAT_SETTINGS_REPOSITORY = Symbol('CHAT_SETTINGS_REPOSITORY');
export const SCAN_PIPELINE = Symbol('SCAN_PIPELINE');

/**
 * DexterModule (Tramo 3, todo 9, P13).
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
