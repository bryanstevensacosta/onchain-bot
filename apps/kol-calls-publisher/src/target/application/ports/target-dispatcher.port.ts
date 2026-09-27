import type { TargetKind } from '../../domain/target-binding';

/**
 * One routed dispatch request: the caller names the link
 * (target + bot + channel, P38-bis per-binding config) and the
 * content; the dispatcher owns the transport choice.
 */
export interface TargetDispatchInput {
  readonly target: TargetKind;
  readonly botId: string;
  readonly chatId: string;
  readonly content: string;
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
    };

/**
 * Outbound port: deliver content to one target binding.
 *
 * `telegram` goes through the telegram-bots-gateway (vault id only,
 * never a token); `threads` goes to `apps/threads-publisher` over
 * HTTP (fail-closed `THREADS_NOT_CONFIGURED` until the binding
 * exists — templates without a threads binding stay telegram-only).
 */
export abstract class TargetDispatcherPort {
  public abstract dispatch(
    input: TargetDispatchInput,
  ): Promise<TargetDispatchResult>;
}
