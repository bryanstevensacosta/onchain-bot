import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ContentNormalizerService } from './content-normalizer.service';

/**
 * Content hash (moved from backend shared/deduplication, todo 4).
 *
 * `sha256(normalize(content))` — the content stage of the cascade.
 */
@Injectable()
export class ContentHashService {
  public constructor(
    private readonly normalizer: ContentNormalizerService = new ContentNormalizerService(),
  ) {}

  public hash(raw: string): string {
    return createHash('sha256')
      .update(this.normalizer.normalize(raw))
      .digest('hex');
  }
}
