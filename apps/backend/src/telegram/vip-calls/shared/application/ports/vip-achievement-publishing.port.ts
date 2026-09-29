/**
 * @deprecated Moved to apps/kol-calls-publisher/src/telegram/ (+ templates orchestration in
 * apps/kol-calls-publisher/src/templates/, seed `vip-calls`) (Tramo 1, todo 11 + P18 companion).
 * P14: `vip-calls` is a template SEED name, never a module. This backend legacy copy stays
 * wired for dual-run; removed at central FINAL REVIEW. Do not extend.
 */
export interface VipAchievementPublishInput {
  readonly callId: string;
  readonly chain: string;
  readonly address: string;
  readonly multiple: number;
  readonly mcAtCall: number;
  readonly mcNow: number;
  readonly chainEmoji: string;
}

export interface VipAchievementPublishOutput {
  readonly telegramMessageId: number | null;
}

export abstract class VipAchievementPublishingPort {
  abstract publishAchievement(
    input: VipAchievementPublishInput,
  ): Promise<VipAchievementPublishOutput>;
}
