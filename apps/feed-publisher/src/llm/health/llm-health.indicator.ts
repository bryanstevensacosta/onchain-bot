import { Injectable } from '@nestjs/common';
import { LlmConfigRepository } from '../domain/ports/llm-config.repository';
import { LlmPort } from '../application/ports/llm.port';

/**
 * P21 hook point: LLM depth health (never liveness). Up in mock mode
 * or when the gateway is configured; down when the gateway is
 * unreachable-by-config or the config row cannot load.
 */
@Injectable()
export class LlmHealthIndicator {
  public constructor(
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly llmPort: LlmPort,
  ) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
  }> {
    try {
      await this.llmConfigRepo.load();
      if (process.env.USE_MOCK_AI === 'true') {
        return { component: 'llm', status: 'up' };
      }
      const available = await this.llmPort.isAvailable();
      return { component: 'llm', status: available ? 'up' : 'down' };
    } catch {
      return { component: 'llm', status: 'down' };
    }
  }
}
