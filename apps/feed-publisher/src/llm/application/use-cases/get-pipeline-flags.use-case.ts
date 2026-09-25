import { Injectable } from '@nestjs/common';
import { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import { MatchingConfigRepository } from '../../../matching/domain/ports/matching-config.repository';
import {
  resolvePipelineFlags,
  type PipelineMode,
  type PipelineFlagInput,
} from '../../domain/pipeline-flags';

export interface PipelineFlagsView {
  readonly flags: PipelineFlagInput;
  readonly llmActive: boolean;
  readonly mode: PipelineMode;
}

/**
 * Composes the 3-flag view: matching (matching module) + llm /
 * publishing (this module). Read-only; each flag is written ONLY by
 * its owning controller.
 */
@Injectable()
export class GetPipelineFlagsUseCase {
  public constructor(
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly matchingConfigRepo: MatchingConfigRepository,
  ) {}

  public async execute(): Promise<PipelineFlagsView> {
    const [llmConfig, matchingConfig] = await Promise.all([
      this.llmConfigRepo.load(),
      this.matchingConfigRepo.load(),
    ]);
    const resolved = resolvePipelineFlags({
      matching: matchingConfig.enabled,
      llm: llmConfig.llmEnabled,
      publishing: llmConfig.publishingEnabled,
    });
    return {
      flags: resolved.flags,
      llmActive: resolved.llmActive,
      mode: resolved.mode,
    };
  }
}
