import { Injectable, Optional } from '@nestjs/common';
import {
  SessionPublisherPort,
  type SessionPublishPlan,
} from '@/sessions/application/ports/session-publisher.port';
import { TargetDispatcherPort } from '@/target/application/ports/target-dispatcher.port';

/**
 * Gateway-backed session publisher (telegram-bots-gateway todo 5;
 * re-homed onto `target/` in threads-publisher plan Fase 2 todo 10).
 *
 * Delivers routed session plans through `TargetDispatcherPort`:
 * `telegram` plans go via the telegram-bots-gateway (vault id only,
 * resolved inside the dispatcher so sessions keep working after
 * `POST /api/content-template-bots/migrate-to-gateway`);
 * `threads` plans enqueue into `apps/threads-publisher` over HTTP.
 * Fail-closed: dispatcher failures throw (the explicit path audits
 * the block; the planner skips fail-safe). Exported but NOT the live
 * binding — the recorder stays live until the global cutover
 * (gateway todo 7).
 */
@Injectable()
export class GatewaySessionPublisher extends SessionPublisherPort {
  public constructor(
    @Optional() private readonly targets?: TargetDispatcherPort,
  ) {
    super();
  }

  public async publish(plan: SessionPublishPlan): Promise<void> {
    if (!this.targets) {
      throw new Error(
        'GatewaySessionPublisher: target dispatcher unwired (not configured)',
      );
    }
    const result = await this.targets.dispatch({
      target: plan.target,
      botId: plan.botId,
      chatId: plan.chatId,
      content: plan.content,
      mode: plan.mode,
      clientMsgId: `session:${plan.sessionId}:${plan.target}:${plan.botId}`,
    });
    if (!result.ok) {
      throw new Error(
        result.error ?? 'GatewaySessionPublisher: publish failed',
      );
    }
  }
}
