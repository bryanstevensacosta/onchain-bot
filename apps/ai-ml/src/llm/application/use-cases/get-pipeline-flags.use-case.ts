import { Injectable } from '@nestjs/common';
import { LlmConfigRepository } from '@/llm/domain/ports/llm-config.repository';
import {
  resolvePipelineFlags,
  type ResolvedPipelineFlags,
} from '@/llm/domain/pipeline-flags';

/**
 * GetPipelineFlagsUseCase (ai-ml, todo 0): resolve the 3-flag view.
 * ai-ml owns llm + publishing; `matching` arrives from the consumer
 * (query param, default false — consumer reports its own switch).
 */
@Injectable()
export class GetPipelineFlagsUseCase {
  public constructor(private readonly configs: LlmConfigRepository) {}

  public async execute(matching: boolean): Promise<ResolvedPipelineFlags> {
    const config = await this.configs.get();
    return resolvePipelineFlags({
      matching,
      llm: config.llmEnabled,
      publishing: config.publishingEnabled,
    });
  }
}
