export interface FetchedImage {
  readonly buffer: Buffer;
  readonly contentType: string;
  readonly ttlMs: number;
}

export const TOKEN_IMAGE_FETCHER = Symbol.for('TokenImageFetcher');

export abstract class TokenImageFetcher {
  public abstract fetch(
    chain: string,
    address: string,
    source?: string,
  ): Promise<FetchedImage>;
}
