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