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

export type LlmProviderName = 'mock' | 'openai' | 'gateway';

/**
 * Outbound port: text generation against an OpenAI-compatible backend.
 * Live binding is selected by env: `USE_MOCK_AI=true` (mock) wins,
 * then the LiteLLM-style gateway (`LLM_GATEWAY_BASE_URL` + key),
 * then OpenAI direct (`OPENAI_API_KEY`). Per-request knobs
 * (model/maxTokens/temperature/reasoningEffort) come from the resolved
 * prompt template (todo 1), so one gateway serves every template
 * variant without restarting.
 */
export abstract class LlmPort {
  public abstract generateText(request: LlmGenerateRequest): Promise<string>;
  public abstract isAvailable(): Promise<boolean>;
  public abstract get providerName(): LlmProviderName;
}
