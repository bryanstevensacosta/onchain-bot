export interface LlmGenerateRequest {
  prompt: string;
  /** Optional image URL to include as multimodal context.
   *  GPT-4o/etc can process images URLs natively. Text-only
   *  adapters log a warning and ignore this. */
  imageUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export abstract class LlmPort {
  public abstract generateText(request: LlmGenerateRequest): Promise<string>;
  public abstract isAvailable(): Promise<boolean>;
}
