import OpenAI from 'openai';
import { LlmPort, LlmGenerateRequest } from '../llm.port';

export class OpenAiAdapter extends LlmPort {
  private readonly client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateText(request: LlmGenerateRequest): Promise<string> {
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: request.prompt },
    ];
    if (request.imageUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: request.imageUrl },
      });
    } else if (request.imageBase64) {
      const mime = request.mimeType ?? 'image/jpeg';
      const dataUrl = `data:${mime};base64,${request.imageBase64}`;
      userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
    const messages: Array<
      | OpenAI.Chat.ChatCompletionSystemMessageParam
      | OpenAI.Chat.ChatCompletionUserMessageParam
    > = [];
    const trimmedSystem = request.systemPrompt?.trim();
    if (trimmedSystem) {
      messages.push({ role: 'system', content: trimmedSystem });
    }
    messages.push({ role: 'user', content: userContent });
    const resp = await this.client.chat.completions.create({
      model: request.model ?? 'gpt-4o-mini',
      messages,
      max_tokens: request.maxTokens ?? 500,
      temperature: request.temperature ?? 0.7,
    });
    return resp.choices[0]?.message?.content ?? '';
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
  }
}
