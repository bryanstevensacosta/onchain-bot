import { Injectable, Optional } from '@nestjs/common';
import {
  SessionPublisherPort,
  type SessionPublishPlan,
} from '../../application/ports/session-publisher.port';
import { BotsGatewaySenderPort } from '../../../telegram/domain/ports/bots-gateway-sender.port';
import { GatewayBotMappingService } from '../../../telegram/infrastructure/gateway/gateway-bot-mapping.service';

/**
 * Gateway-backed session publisher (telegram-bots-gateway todo 5).
 *
 * Delivers routed session plans as `message` sends through the gateway
 * vault id (mapped from the plan `botId`, never a token). Sessions and
 * targets keep working because the mapping resolves catalog ids
 * migrated by `POST /api/content-template-bots/migrate-to-gateway`;
 * unmapped ids fall back to the local id. Fail-closed: gateway
 * failures throw (the explicit path audits the block; the planner
 * skips fail-safe). Exported but NOT the live binding — the recorder
 * stays live until the global cutover (gateway todo 7).
 */
@Injectable()
export class GatewaySessionPublisher extends SessionPublisherPort {
  public constructor(
    @Optional() private readonly gateway?: BotsGatewaySenderPort,
    @Optional() private readonly mapping?: GatewayBotMappingService,
  ) {
    super();
  }

  public async publish(plan: SessionPublishPlan): Promise<void> {
    if (!this.gateway) {
      throw new Error(
        'GatewaySessionPublisher: gateway client unwired (not configured)',
      );
    }
    const result = await this.gateway.sendViaGateway({
      botId: this.mapping?.resolveGatewayId(plan.botId) ?? plan.botId,
      chatId: plan.chatId,
      kind: 'message',
      text: plan.content,
      clientMsgId: `session:${plan.sessionId}:${plan.target}:${plan.botId}`,
    });
    if (!result.ok) {
      throw new Error(
        result.error ?? 'GatewaySessionPublisher: publish failed',
      );
    }
  }
}
