import { Injectable } from '@nestjs/common';
import { LlmPort } from '../../application/ports/llm.port';

/**
 * Mock LLM (USE_MOCK_AI=true): dev/test generation without provider
 * cost. Tags output so mock text is never mistaken for a real rewrite.
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
