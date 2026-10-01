import { Injectable } from '@nestjs/common';
import { resolveAiMlMode } from '../ai-ml-mode';
import { AiMlLlmClientAdapter } from '../infrastructure/ai-ml-llm-client.adapter';
import {
  AiMlParityService,
  type AiMlParitySummary,
} from '../application/services/ai-ml-parity.service';

export interface AiMlStatusView {
  readonly mode: string;
  readonly remote: {
    readonly reachable: boolean;
    readonly latencyMs: number | null;
  };
  readonly parity: AiMlParitySummary;
  readonly diverged: boolean;
}

/**
 * P21 depth health for the ai-ml migration (never liveness).
 *
 * `local` mode is always `up` (no remote needed); `dual` stays `up`
 * when ai-ml is down (serving is unaffected — the gap shows in the
 * parity ledger instead); only `ai-ml` serving mode reports `down`
 * on an unreachable remote.
 */
@Injectable()
export class AiMlHealthIndicator {
  public constructor(private readonly remote: AiMlLlmClientAdapter) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
  }> {
    const mode = resolveAiMlMode(process.env['FEED_AI_ML_MODE']);
    if (mode === 'local') {
      return { component: 'ai-ml', status: 'up' };
    }
    try {
      const reachable = await this.remote.isAvailable();
      if (mode === 'ai-ml') {
        return { component: 'ai-ml', status: reachable ? 'up' : 'down' };
      }
      return { component: 'ai-ml', status: 'up' };
    } catch {
      return { component: 'ai-ml', status: mode === 'ai-ml' ? 'down' : 'up' };
    }
  }
}

export const buildAiMlStatusView = async (
  remote: AiMlLlmClientAdapter,
  parity: AiMlParityService,
): Promise<AiMlStatusView> => {
  const started = Date.now();
  let reachable = false;
  try {
    reachable = await remote.isAvailable();
  } catch {
    reachable = false;
  }
  const summary = parity.summary();
  return {
    mode: resolveAiMlMode(process.env['FEED_AI_ML_MODE']),
    remote: {
      reachable,
      latencyMs: reachable ? Date.now() - started : null,
    },
    parity: summary,
    diverged: summary.diverged > 0,
  };
};
