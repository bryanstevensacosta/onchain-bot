/**
 * LLM entry view (R-b1, llm side).
 *
 * Structural subset of the moved `PublisherQueueEntry`: only what
 * generation reads (content + title + media + template binding).
 * The unified queue moved to `apps/publishing-queue/`; llm keeps this
 * view so the generator/renderer/playground compile and test without
 * importing the moved aggregate.
 */
export interface LlmEntryView {
  readonly rawContent: string;
  readonly rawTitle: string | null;
  readonly imagePaths: ReadonlyArray<string>;
  readonly keywordTemplateId: string | null;
}
