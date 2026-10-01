import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmPort } from './application/ports/llm.port';
import { MockLlmAdapter } from './infrastructure/llm/mock-llm.adapter';
import { OpenAiAdapter } from './infrastructure/llm/openai.adapter';
import { LlmGatewayAdapter } from './infrastructure/llm/llm-gateway.adapter';
import { LlmConfigRepository } from './domain/ports/llm-config.repository';
import { InMemoryLlmConfigRepository } from './infrastructure/persistence/in-memory/in-memory-llm-config.repository';
import { UsageAuditService } from './application/usage-audit.service';
import { GenerateTextUseCase } from './application/use-cases/generate-text.use-case';
import { GetLlmModelsUseCase } from './application/use-cases/get-llm-models.use-case';
import { GetPipelineFlagsUseCase } from './application/use-cases/get-pipeline-flags.use-case';
import { LlmController } from './api/http/llm.controller';

/**
 * LlmModule (ai-ml, todo 0): multi-provider gateway + 3-flag mirror.
 *
 * Provider selection: `USE_MOCK_AI=true` (mock, zero cost) wins, then
 * the LiteLLM-style gateway (`LLM_GATEWAY_BASE_URL` + key), then
 * OpenAI direct (`OPENAI_API_KEY`). Nothing configured → the gateway
 * adapter stays bound but unavailable, and every generation fails fast
 * with a clear error (consumer drain path turns it into FAILED +
 * retry). Owns `LlmConfig` (llm + publishing; matching arrives from
 * the consumer) + usage audit (sizes only, never content).
 */
@Module({
  imports: [ConfigModule],
  controllers: [LlmController],
  providers: [
    MockLlmAdapter,
    OpenAiAdapter,
    LlmGatewayAdapter,
    {
      provide: LlmPort,
      useFactory: (
        config: ConfigService,
        mock: MockLlmAdapter,
        gateway: LlmGatewayAdapter,
        openai: OpenAiAdapter,
      ): LlmPort => {
        if (config.get<string>('USE_MOCK_AI', 'true') === 'true') {
          return mock;
        }
        if (config.get<string>('LLM_GATEWAY_BASE_URL', '').trim()) {
          return gateway;
        }
        if (config.get<string>('OPENAI_API_KEY', '').trim()) {
          return openai;
        }
        return gateway;
      },
      inject: [ConfigService, MockLlmAdapter, LlmGatewayAdapter, OpenAiAdapter],
    },
    {
      provide: LlmConfigRepository,
      useClass: InMemoryLlmConfigRepository,
    },
    UsageAuditService,
    GenerateTextUseCase,
    GetLlmModelsUseCase,
    GetPipelineFlagsUseCase,
  ],
  exports: [
    LlmPort,
    LlmConfigRepository,
    UsageAuditService,
    GenerateTextUseCase,
  ],
})
export class LlmModule {}
