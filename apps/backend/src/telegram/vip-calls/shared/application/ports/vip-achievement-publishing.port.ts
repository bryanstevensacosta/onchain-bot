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
  abstract publishAchievement(input: VipAchievementPublishInput): Promise<VipAchievementPublishOutput>;
}