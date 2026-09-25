import type { PublishTarget } from '../../../template/domain/template-target';

/**
 * One routed publish plan per (session, target, bot).
 */
export interface SessionPublishPlan {
  readonly sessionId: string;
  readonly target: PublishTarget;
  readonly botId: string;
  readonly chatId: string;
  readonly mode: 'llm' | 'raw';
  readonly content: string;
}

/**
 * Outbound port: deliver routed session plans.
 *
 * The live binding in this todo is the in-memory recorder (test double
 * + dashboard visibility); the Bot API binding is a follow-up that
 * resolves catalog tokens per call (same per-call-token shape as the
 * telegram BC, todo 7).
 */
export abstract class SessionPublisherPort {
  public abstract publish(plan: SessionPublishPlan): Promise<void>;
}
