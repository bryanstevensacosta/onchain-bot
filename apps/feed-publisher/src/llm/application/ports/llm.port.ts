export interface LlmGenerateRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
}

/**
 * Outbound port: text generation against an OpenAI-compatible gateway.
 * Live binding is selected by `USE_MOCK_AI` (mock) vs the gateway
 * adapter (default). Per-request knobs (model/maxTokens/temperature/
 * reasoningEffort) come from the resolved `PromptTemplate`, so one
 * physical gateway serves every template variant without restarting.
 */
export abstract class LlmPort {
  public abstract generateText(request: LlmGenerateRequest): Promise<string>;
  public abstract isAvailable(): Promise<boolean>;
}
