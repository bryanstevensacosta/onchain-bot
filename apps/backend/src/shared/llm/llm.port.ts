export interface LlmGenerateRequest {
  prompt: string;
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
}

export abstract class LlmPort {
  public abstract generateText(request: LlmGenerateRequest): Promise<string>;
  public abstract isAvailable(): Promise<boolean>;
}
