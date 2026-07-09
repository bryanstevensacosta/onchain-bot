export interface LlmGenerateRequest {
  prompt: string;
  /**
   * Optional system message prepended to the messages array. When
   * set (and non-empty after trim) adapters send a `[system, user]`
   * pair; otherwise only the user message is sent. Lets a
   * `PromptTemplate.systemPromptText` carry the persona/role/style
   * separately from the user prompt body.
   */
  systemPrompt?: string;
  /**
   * Optional per-request model override. When set, adapters use
   * this model identifier instead of their own configured default.
   * Lets a `PromptTemplate.model` win over the gateway-wide
   * `app.llm.gateway.model` setting without restarting the process.
   * Adapters that hard-code a model (e.g. `OpenAiAdapter`) honour
   * this too so tests can pin a specific model.
   */
  model?: string;
  /** Optional image URL to include as multimodal context.
   *  GPT-4o/etc can process images URLs natively. Text-only
   *  adapters log a warning and ignore this. */
  imageUrl?: string;
  /**
   * Optional image bytes encoded as base64. The OpenAI adapter
   * converts this into a `data:<mimeType>;base64,...` URL so the
   * model can "see" a local file the caller has on disk
   * (e.g. a Telegram photo already downloaded by the crypto-news
   * listener). Mutually exclusive with `imageUrl` — if both are set
   * `imageUrl` wins. Adapters that don't support multimodal content
   * log a warning and ignore.
   */
  imageBase64?: string;
  /**
   * MIME type that accompanies `imageBase64` (e.g. `image/jpeg`,
   * `image/png`, `image/webp`). Required when `imageBase64` is set.
   */
  mimeType?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Reasoning effort hint for models that expose one (e.g.
   * `opencode-zen/deepseek-v4-flash`). Maps to OpenAI's
   * `reasoning_effort` field. Use `'low'` to give the model less
   * room to "think" so the actual output fits in `maxTokens`.
   * DeepSeek V4 Flash supports 4 modes: `low`, `medium`, `high`, `max`.
   * Ignored by adapters/models that do not support it.
   */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
}

export abstract class LlmPort {
  public abstract generateText(request: LlmGenerateRequest): Promise<string>;
  public abstract isAvailable(): Promise<boolean>;
}
