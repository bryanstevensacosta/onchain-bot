import OpenAI from 'openai';
import { LlmPort, LlmGenerateRequest } from '../llm.port';

export class OpenAiAdapter extends LlmPort {
  private readonly client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateText(request: LlmGenerateRequest): Promise<string> {
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: request.prompt },
    ];
    if (request.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: request.imageUrl } });
    }
    const resp = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content }],
      max_tokens: request.maxTokens ?? 500,
      temperature: request.temperature ?? 0.7,
    });
    return resp.choices[0]?.message?.content ?? '';
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
  }
}
