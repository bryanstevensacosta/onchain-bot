/**
 * Outbound port for publishing TEXT posts to the Threads Graph API.
 *
 * Owned by T3 (`threads-publisher` plan todo 3). T2's
 * `ProcessNextThreadsArticleUseCase` depends on this port; the concrete
 * `ThreadsApiPublisherAdapter` (infrastructure/senders) implements it.
 * Whoever creates this file first wins — T2 reuses it as-is.
 */
export interface ThreadsPublishInput {
  readonly text: string;
  readonly imagePath?: string | null;
  readonly imagePaths?: ReadonlyArray<string>;
}

export interface ThreadsPublishSuccess {
  readonly ok: true;
  readonly status: 'published';
  /** Threads media id returned by `threads_publish`. */
  readonly remoteId: string;
  /** Final text sent to the API (after the 500-char pre-publish guard). */
  readonly text: string;
  /** True when the input was truncated to fit the 500-char limit. */
  readonly truncated: boolean;
}

export interface ThreadsPublishFailure {
  readonly ok: false;
  readonly status: 'FAILED';
  readonly reason: string;
  /** True for rate-limit/transient failures (safe to retry later). */
  readonly reintentable: boolean;
}

export type ThreadsPublishResult =
  | ThreadsPublishSuccess
  | ThreadsPublishFailure;

export abstract class ThreadsApiPublisherPort {
  public abstract publish(
    input: ThreadsPublishInput,
  ): Promise<ThreadsPublishResult>;
}
