import { Injectable, Logger } from '@nestjs/common';
import { LlmPort } from 'shared/llm/llm.port';

export type ArbiterVerdict = 'DUPLICATE' | 'UPDATE' | 'DIFFERENT';

/**
 * Per-side cap for the user-supplied text segments in the arbiter prompt.
 * Inputs beyond this are symmetrically truncated to head(1400) + '\n… [truncated]\n' + tail(600).
 * The scorer zone (embedding) is NOT affected — it always sees the full text.
 */
const MAX_ARBITER_TEXT_CHARS = 2000;
const MAX_ARBITER_HEAD_CHARS = 1400;
const MAX_ARBITER_TAIL_CHARS = 600;
const TRUNCATION_MARKER = '\n… [truncated]\n';

@Injectable()
export class LlmArbiterService {
  private readonly logger = new Logger(LlmArbiterService.name);

  constructor(private readonly llm: LlmPort) {}

  /**
   * Ask the LLM to classify a gray-zone pair.
   * Returns DIFFERENT if LLM is unavailable or parsing fails (fail-open).
   */
  async arbitrate(
    existingText: string,
    incomingText: string,
    similarity: number,
  ): Promise<ArbiterVerdict> {
    try {
      const available = await this.llm.isAvailable();
      if (!available) {
        this.logger.warn(
          'LLM unavailable, defaulting gray-zone pair to DIFFERENT (fail-open)',
        );
        return 'DIFFERENT';
      }

      const prompt = this.buildPrompt(existingText, incomingText, similarity);
      const result = await this.llm.generateText({
        prompt,
        systemPrompt:
          'You are a crypto news deduplication system. Analyze two news items and output EXACTLY one word: DUPLICATE, UPDATE, or DIFFERENT.',
        maxTokens: Number(process.env.DEDUP_LLM_MAX_TOKENS ?? 300),
        temperature: 0.1, // low temperature for consistent classification
        model: process.env.DEDUP_LLM_MODEL,
      });

      return this.parseVerdict(result);
    } catch (error) {
      this.logger.error(
        `LLM arbitration failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return 'DIFFERENT'; // fail-open
    }
  }

  private buildPrompt(
    existingText: string,
    incomingText: string,
    similarity: number,
  ): string {
    const existing = this.truncateForPrompt(existingText);
    const incoming = this.truncateForPrompt(incomingText);

    return `Compare these two crypto news items (cosine similarity: ${similarity.toFixed(4)}).

EXISTING ITEM:
${existing}

INCOMING ITEM:
${incoming}

Decide if the incoming item is:
- DUPLICATE: Same event, same facts, same price targets. No new info.
- UPDATE: Related to same subject but adds new information (e.g. updated price, new development, additional details).
- DIFFERENT: Different event, different subject, or substantially different information.

Output EXACTLY one word: DUPLICATE, UPDATE, or DIFFERENT.`;
  }

  /**
   * Symmetric head+tail truncation preserving both the subject and any
   * trailing UPDATE signal (numbers, follow-ups appended at the end of posts).
   */
  private truncateForPrompt(text: string): string {
    if (text.length <= MAX_ARBITER_TEXT_CHARS) return text;
    const head = text.slice(0, MAX_ARBITER_HEAD_CHARS);
    const tail = text.slice(text.length - MAX_ARBITER_TAIL_CHARS);
    return `${head}${TRUNCATION_MARKER}${tail}`;
  }

  private parseVerdict(raw: string): ArbiterVerdict {
    const cleaned = raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    if (cleaned === 'DUPLICATE') return 'DUPLICATE';
    if (cleaned === 'UPDATE') return 'UPDATE';
    if (cleaned === 'DIFFERENT') return 'DIFFERENT';

    // If LLM returned unexpected text, try to find one of the keywords
    if (cleaned.includes('DUPLICATE')) return 'DUPLICATE';
    if (cleaned.includes('UPDATE')) return 'UPDATE';
    if (cleaned.includes('DIFFERENT')) return 'DIFFERENT';

    this.logger.warn(
      `Unexpected LLM verdict: "${raw}", defaulting to DIFFERENT`,
    );
    return 'DIFFERENT'; // fail-open
  }

  /**
   * Wrapper method matching DeduplicationService's expected interface.
   *
   * This method is used by DeduplicationService when it needs to classify
   * the relation between two texts during semantic dedup checks.
   */
  async classifyRelation(
    existingText: string,
    incomingText: string,
    similarity: number = 0.85,
  ): Promise<{
    relation: 'duplicate' | 'update' | 'different';
    confidence: number;
    reason?: string;
  }> {
    const verdict = await this.arbitrate(
      existingText,
      incomingText,
      similarity,
    );
    const relationMap: Record<
      ArbiterVerdict,
      'duplicate' | 'update' | 'different'
    > = {
      DUPLICATE: 'duplicate',
      UPDATE: 'update',
      DIFFERENT: 'different',
    };
    return {
      relation: relationMap[verdict],
      confidence: verdict === 'DIFFERENT' ? 0.95 : 0.85,
    };
  }
}
