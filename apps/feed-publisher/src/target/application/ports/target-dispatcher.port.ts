import type { PublishTarget } from '@/target/domain/target-binding';

/**
 * One routed dispatch request: the caller names the link
 * (target + bot + channel, P38-bis per-binding config) and the
 * content; the dispatcher owns the transport choice.
 */
export interface TargetDispatchInput {
  readonly target: PublishTarget;
  readonly botId: string;
  readonly chatId: string;
  readonly content: string;
  readonly mode: 'llm' | 'raw';
  readonly clientMsgId?: string;
}

export type TargetDispatchResult =
  | {
      readonly ok: true;
      readonly remoteId: string;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly held: boolean;
    };

/**
 * Outbound port: deliver content to one target binding.
 *
 * `telegram` goes through the telegram-bots-gateway (vault id only,
 * never a token); `threads` goes to `apps/threads-publisher` over
 * HTTP. `held: true` means per-binding pacing held the send
 * (delay-not-met / cap-reached: retry later, never dropped).
 */
export abstract class TargetDispatcherPort {
  public abstract dispatch(
    input: TargetDispatchInput,
  ): Promise<TargetDispatchResult>;
}
