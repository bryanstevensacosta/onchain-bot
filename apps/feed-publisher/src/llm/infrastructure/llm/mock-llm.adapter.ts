import { Injectable } from '@nestjs/common';
import { LlmPort } from '../../application/ports/llm.port';

/**
 * Mock LLM (USE_MOCK_AI=true): dev/test generation without provider
 * cost. Tags output so mock text is never mistaken for a real rewrite.
 *
 * @deprecated Dual local leg only (cutover since ai-ml todo 4, default ai-ml): serves exclusively
 * through `DualLlmAdapter` under `FEED_AI_ML_MODE`. Dual-leg only (local|dual rollback/shadow); removal planned — new code must call ai-ml over HTTP.
 */
@Injectable()
export class MockLlmAdapter extends LlmPort {
  public async generateText(request: { prompt: string }): Promise<string> {
    return `[LLM MOCK] Generated text for: '${request.prompt.slice(0, 50)}...'`;
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }
}
