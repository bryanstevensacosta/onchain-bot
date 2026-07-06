import { Global, Module } from '@nestjs/common';
import { LlmPort } from './llm.port';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { MockLlmAdapter } from './mock.llm.adapter';

const LLM_PROVIDER = {
  provide: LlmPort,
  useFactory: () => {
    if (process.env.OPENAI_API_KEY) {
      return new OpenAiAdapter();
    }
    return new MockLlmAdapter();
  },
};

@Global()
@Module({
  providers: [LLM_PROVIDER],
  exports: [LlmPort],
})
export class LlmModule {}
