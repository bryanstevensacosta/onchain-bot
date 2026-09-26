import { ConflictException, Injectable } from '@nestjs/common';

export type AiMlParityOutcome = 'matched' | 'diverged' | 'skipped';

export interface AiMlLegLedger {
  matched: number;
  diverged: number;
  skipped: number;
}

export interface AiMlParitySummary {
  readonly llm: AiMlLegLedger;
  readonly embeddings: AiMlLegLedger;
  readonly prompts: AiMlLegLedger;
  readonly compared: number;
  readonly diverged: number;
}

/**
 * Dual-run parity ledger for the ai-ml migration (ai-ml plan todo 3).
 *
 * Compares are outcome-level, never string-identity, except in mock
 * mode where both legs run the same deterministic algorithm and MUST
 * agree byte-for-byte (mock drift is a real migration signal):
 * - LLM: both succeed with non-empty text (exact when mockMode),
 *   or both fail. One-sided failure/emptiness diverges.
 * - Embeddings: both vectors with equal length and cosine >= 0.999,
 *   or both missing. ai-ml outages surface as throws upstream, so a
 *   dual caller records `skipped` (never diverged, never blocking).
 * - Prompts: trimmed content + systemContent equality, or both
 *   missing (catalog drift diverges — the operator must sync names).
 *
 * `assertNoDivergence()` is the cutover gate: any divergence blocks
 * `FEED_AI_ML_MODE=ai-ml` promotion (mirrors the bots-gateway
 * `DualSendParityService` contract).
 */
@Injectable()
export class AiMlParityService {
  private static readonly EMBEDDING_COSINE_FLOOR = 0.999;

  private readonly llm: AiMlLegLedger = { matched: 0, diverged: 0, skipped: 0 };
  private readonly embeddings: AiMlLegLedger = {
    matched: 0,
    diverged: 0,
    skipped: 0,
  };
  private readonly prompts: AiMlLegLedger = {
    matched: 0,
    diverged: 0,
    skipped: 0,
  };
  private lastDivergence: string | null = null;

  public compareLlmTexts(
    local: string | null,
    remote: string | null,
    opts?: { mockMode?: boolean },
  ): AiMlParityOutcome {
    const localText = (local ?? '').trim();
    const remoteText = (remote ?? '').trim();
    if (localText.length === 0 && remoteText.length === 0) {
      return 'matched';
    }
    if (localText.length === 0 || remoteText.length === 0) {
      return 'diverged';
    }
    if (opts?.mockMode === true && localText !== remoteText) {
      return 'diverged';
    }
    return 'matched';
  }

  public compareEmbeddings(
    local: ReadonlyArray<number> | null,
    remote: ReadonlyArray<number> | null,
  ): AiMlParityOutcome {
    if (local === null && remote === null) {
      return 'matched';
    }
    if (local === null || remote === null) {
      return 'diverged';
    }
    if (local.length !== remote.length || local.length === 0) {
      return 'diverged';
    }
    return cosineSimilarity(local, remote) >=
      AiMlParityService.EMBEDDING_COSINE_FLOOR
      ? 'matched'
      : 'diverged';
  }

  public comparePrompts(
    local: { content: string; systemContent: string } | null,
    remote: { content: string; systemContent: string } | null,
  ): AiMlParityOutcome {
    if (local === null && remote === null) {
      return 'matched';
    }
    if (local === null || remote === null) {
      return 'diverged';
    }
    return local.content.trim() === remote.content.trim() &&
      local.systemContent.trim() === remote.systemContent.trim()
      ? 'matched'
      : 'diverged';
  }

  public recordLlm(outcome: AiMlParityOutcome, detail?: string): void {
    this.record(this.llm, 'llm', outcome, detail);
  }

  public recordEmbedding(outcome: AiMlParityOutcome, detail?: string): void {
    this.record(this.embeddings, 'embeddings', outcome, detail);
  }

  public recordPrompt(outcome: AiMlParityOutcome, detail?: string): void {
    this.record(this.prompts, 'prompts', outcome, detail);
  }

  public summary(): AiMlParitySummary {
    const compared =
      this.llm.matched +
      this.llm.diverged +
      this.embeddings.matched +
      this.embeddings.diverged +
      this.prompts.matched +
      this.prompts.diverged;
    const diverged =
      this.llm.diverged + this.embeddings.diverged + this.prompts.diverged;
    return {
      llm: { ...this.llm },
      embeddings: { ...this.embeddings },
      prompts: { ...this.prompts },
      compared,
      diverged,
    };
  }

  public assertNoDivergence(): void {
    const { diverged } = this.summary();
    if (diverged > 0) {
      throw new ConflictException(
        'ai-ml dual-run diverged (' +
          diverged +
          ' diverged comparisons; last: ' +
          (this.lastDivergence ?? 'unknown') +
          ') — cutover to FEED_AI_ML_MODE=ai-ml is blocked',
      );
    }
  }

  private record(
    ledger: AiMlLegLedger,
    leg: string,
    outcome: AiMlParityOutcome,
    detail?: string,
  ): void {
    ledger[outcome] += 1;
    if (outcome === 'diverged') {
      this.lastDivergence =
        leg + (detail !== undefined ? ': ' + detail : '');
    }
  }
}

const cosineSimilarity = (
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
