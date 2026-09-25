import { ValueObject } from '../kernel/value-object';

/**
 * ContentType VO (Tramo 2, todo 1).
 *
 * Unified queue discriminator: every queued/published item carries
 * one of these. Threads exist as a type from day one (routing +
 * contract), even though threads publishing is a v1 stub (todo 8).
 */
export const CONTENT_TYPES = ['crypto-news', 'threads'] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export class ContentTypeVo extends ValueObject<{ raw: ContentType }> {
  private constructor(type: ContentType) {
    super({ raw: type });
  }

  public static from(raw: string): ContentTypeVo {
    if (!CONTENT_TYPES.includes(raw as ContentType)) {
      throw new Error(`Unsupported content type: ${raw}`);
    }
    return new ContentTypeVo(raw as ContentType);
  }

  public get raw(): ContentType {
    return this.value.raw;
  }

  public isThreads(): boolean {
    return this.value.raw === 'threads';
  }
}
