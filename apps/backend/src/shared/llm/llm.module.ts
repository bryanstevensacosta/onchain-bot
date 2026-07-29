import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmPort } from './llm.port';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { LlmGatewayAdapter } from './adapters/llm-gateway.adapter';
import { MockLlmAdapter } from './mock.llm.adapter';

const LLM_PROVIDER = {
  provide: LlmPort,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    // Priority: LlmGatewayAdapter (LiteLLM proxy) > OpenAiAdapter > MockLlmAdapter
    const gatewayBaseUrl = config.get<string>('app.llm.gateway.baseUrl');
    const gatewayApiKey = config.get<string>('app.llm.gateway.apiKey');
    if (gatewayBaseUrl && gatewayApiKey) {
      return new LlmGatewayAdapter(config);
    }
    if (process.env.OPENAI_API_KEY) {
      return new OpenAiAdapter();
    }
    return new MockLlmAdapter();
  },
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LLM_PROVIDER],
  exports: [LlmPort],
})
export class LlmModule {}
