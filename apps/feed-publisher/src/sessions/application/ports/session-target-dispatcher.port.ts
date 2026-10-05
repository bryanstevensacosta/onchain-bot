import type { PublishTarget } from '@/template/domain/template-target';

/**
 * Sessions-side target dispatch port (R-b1).
 *
 * Structural mirror of the moved `TargetDispatcherPort` (now owned by
 * `apps/publishing-queue/` `gateway/`): sessions never import the
 * moved tree. Unbound until the B1 dual provides the HTTP dispatcher
 * — the adapter fails closed with `not configured` meanwhile.
 */
export interface SessionTargetDispatchInput {
  readonly target: PublishTarget;
  readonly botId: string;
  readonly chatId: string;
  readonly content: string;
  readonly mode: 'llm' | 'raw';
  readonly clientMsgId?: string;
}

export type SessionTargetDispatchResult =
  | { readonly ok: true; readonly remoteId: string }
  | { readonly ok: false; readonly error: string };

export abstract class SessionTargetDispatcherPort {
  public abstract dispatch(
    input: SessionTargetDispatchInput,
  ): Promise<SessionTargetDispatchResult>;
}
