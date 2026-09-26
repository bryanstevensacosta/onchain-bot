import { Injectable } from '@nestjs/common';
import { LlmPort } from '../../application/ports/llm.port';

/**
 * Mock LLM (USE_MOCK_AI=true): dev/test generation without provider
 * cost. Tags output so mock text is never mistaken for a real rewrite.
 *
 * @deprecated Dual local leg only (ai-ml todo 3): serves exclusively
 * through `DualLlmAdapter` under `FEED_AI_ML_MODE`. Removed at ai-ml
 * todo 4 cutover — new code must call ai-ml over HTTP.
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
