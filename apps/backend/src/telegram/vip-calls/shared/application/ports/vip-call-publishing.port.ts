/**
 * @deprecated Moved to apps/kol-calls-publisher/src/telegram/ (+ templates orchestration in
 * apps/kol-calls-publisher/src/templates/, seed `vip-calls`) (Tramo 1, todo 11 + P18 companion).
 * P14: `vip-calls` is a template SEED name, never a module. This backend legacy copy stays
 * wired for dual-run; removed at central FINAL REVIEW. Do not extend.
 */
export interface VipCallPublishInput {
  readonly callId: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string;
  readonly score: number;
  readonly tier: string;
  readonly classification: string;
  readonly message: string;
  readonly mcAtCall: number;
  readonly kolId?: string;
  readonly kolUsername?: string;
}

export interface VipCallPublishOutput {
  readonly telegramMessageId: number | null;
  readonly publishedChannelIds: ReadonlyArray<string>;
  readonly failedChannelIds: ReadonlyArray<string>;
}

export abstract class VipCallPublishingPort {
  abstract publish(input: VipCallPublishInput): Promise<VipCallPublishOutput>;
}
