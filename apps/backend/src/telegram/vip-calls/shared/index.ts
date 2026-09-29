/**
 * @deprecated Moved to apps/kol-calls-publisher/src/telegram/ (+ templates orchestration in
 * apps/kol-calls-publisher/src/templates/, seed `vip-calls`) (Tramo 1, todo 11 + P18 companion).
 * P14: `vip-calls` is a template SEED name, never a module. This backend legacy copy stays
 * wired for dual-run; removed at central FINAL REVIEW. Do not extend.
 */
export {
  VipCallPublishingPort,
  type VipCallPublishInput,
  type VipCallPublishOutput,
} from './application/ports/vip-call-publishing.port';
export {
  VipAchievementPublishingPort,
  type VipAchievementPublishInput,
  type VipAchievementPublishOutput,
} from './application/ports/vip-achievement-publishing.port';
export { VipCallsBotApiPublisherAdapter } from './infrastructure/senders/bot-api-telegram-publisher.adapter';
