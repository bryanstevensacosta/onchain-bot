/**
 * Legacy telegram delivery surface, re-exported through `target/`
 * (threads-publisher plan Fase 2 todo 10).
 *
 * Callers resolve delivery through `src/target/` — never import the
 * legacy `src/telegram/` tree directly. The classes below stay owned
 * by `TelegramModule` (deprecated, dual-leg only, removed at
 * threads-publisher todo 11); this barrel is the only sanctioned
 * import path until the removal.
 */
export { TelegramPublisherPort } from '../telegram/domain/ports/telegram-publisher.port';
export type {
  SendMessageInput,
  SendResult,
} from '../telegram/domain/ports/telegram-publisher.port';
export { BotTokenResolverPort } from '../telegram/domain/ports/bot-token-resolver.port';
export { BotsGatewaySenderPort } from '../telegram/domain/ports/bots-gateway-sender.port';
export type { GatewaySendInput } from '../telegram/domain/ports/bots-gateway-sender.port';
export { DualSendParityService } from '../telegram/application/services/dual-send-parity.service';
export { GatewayBotMappingService } from '../telegram/infrastructure/gateway/gateway-bot-mapping.service';
export { TelegramHealthIndicator } from '../telegram/health/telegram-health.indicator';
