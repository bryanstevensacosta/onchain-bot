export interface ThreadsPublishInput {
  readonly text: string;
  readonly imagePath?: string | null;
  readonly imagePaths?: string[];
}

export type ThreadsPublishResult =
  | {
      readonly ok: true;
      readonly status: 'published';
      readonly remoteId: string;
      readonly text: string;
      readonly truncated: boolean;
    }
  | {
      readonly ok: false;
      readonly status: 'FAILED';
      readonly reason: string;
      readonly reintentable: boolean;
    };

export abstract class ThreadsApiPublisherPort {
  public abstract publish(
    input: ThreadsPublishInput,
  ): Promise<ThreadsPublishResult>;
}
