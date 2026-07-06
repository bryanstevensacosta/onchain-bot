import { LlmPort, LlmGenerateRequest } from './llm.port';

export class MockLlmAdapter extends LlmPort {
  async generateText(request: LlmGenerateRequest): Promise<string> {
    return `[LLM MOCK] Generated text for: "${request.prompt.slice(0, 50)}..."`;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
