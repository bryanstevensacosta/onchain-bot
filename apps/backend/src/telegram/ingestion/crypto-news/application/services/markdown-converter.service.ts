import { Injectable, Logger } from '@nestjs/common';

export interface TelegramEntity {
  readonly type: string;
  readonly offset: number;
  readonly length: number;
  readonly url?: string | null;
}

export interface MarkdownConverterOptions {
  /** Whether to parse formattingEntities JSON string */
  parseEntitiesJson?: boolean;
  /** Logger context for warnings */
  loggerContext?: string;
}

/**
 * Service for converting Telegram message content with entities/HTML to Markdown.
 *
 * Handles:
 * - Telegram entities (bold, italic, code, pre, text_link, etc.)
 * - Basic HTML tags (<b>, <strong>, <i>, <em>, <code>, <a>, <pre>)
 * - Nested entities (e.g., <b><i>text</i></b> → **_text_**)
 * - Malformed HTML (fallback to plain text)
 * - Malformed JSON entities (fallback to empty array)
 *
 * The `formattingEntities` field from CryptoNewsMessage is a JSON string
 * that gets parsed with graceful error handling.
 */
@Injectable()
export class MarkdownConverter {
  private readonly logger = new Logger(MarkdownConverter.name);

  /**
   * Convert content with Telegram entities and/or HTML tags to Markdown.
   *
   * @param content - The raw text content
   * @param entities - Optional Telegram entities array (from TelegramRawMessage)
   * @param formattingEntitiesJson - Optional JSON string of formatting entities (from CryptoNewsMessage.formattingEntities)
   * @returns Markdown-formatted string
   */
  public convertToMarkdown(
    content: string,
    entities?: ReadonlyArray<TelegramEntity>,
    formattingEntitiesJson?: string | null,
    options: MarkdownConverterOptions = {},
  ): string {
    if (!content || content.length === 0) {
      return content;
    }

    const { parseEntitiesJson = true, loggerContext = MarkdownConverter.name } =
      options;

    // Parse JSON entities if provided
    let jsonEntities: ReadonlyArray<TelegramEntity> = [];
    if (parseEntitiesJson && formattingEntitiesJson) {
      jsonEntities = this.parseEntitiesJson(
        formattingEntitiesJson,
        loggerContext,
      );
    }

    // Combine entities from both sources
    const allEntities = [...(entities ?? []), ...jsonEntities];

    if (allEntities.length === 0) {
      // No entities, but still process HTML tags if present
      return this.convertHtmlToMarkdown(content);
    }

    // Process HTML first, then apply entities on the HTML-converted content
    // This ensures entities refer to the visible text content
    const htmlConverted = this.convertHtmlToMarkdown(content);

    // Map entity offsets from original content to HTML-converted content
    const mappedEntities = this.mapEntityOffsets(
      content,
      htmlConverted,
      allEntities,
    );

    // Sort entities by offset (ascending) then by length (descending for nesting)
    const sortedEntities = [...mappedEntities].sort((a, b) => {
      if (a.offset !== b.offset) {
        return a.offset - b.offset;
      }
      return b.length - a.length; // Longer entities first for proper nesting
    });

    // Build markdown by processing entities on HTML-converted content
    return this.applyEntitiesToContent(htmlConverted, sortedEntities);
  }

  /**
   * Map entity offsets from plain text (HTML-stripped) to HTML-converted markdown.
   * Entities are assumed to reference the visible text content, not raw HTML.
   */
  private mapEntityOffsets(
    original: string,
    converted: string,
    entities: ReadonlyArray<TelegramEntity>,
  ): TelegramEntity[] {
    // Strip HTML tags from original to get plain text
    const plainText = original.replace(/<[^>]+>/g, '');

    // Build mapping from plain text indices to converted markdown indices
    const mapping: number[] = new Array(plainText.length + 1).fill(
      0,
    ) as number[];
    let plainIdx = 0;
    let convIdx = 0;

    while (plainIdx < plainText.length && convIdx < converted.length) {
      if (plainText[plainIdx] === converted[convIdx]) {
        mapping[plainIdx] = convIdx;
        plainIdx++;
        convIdx++;
      } else {
        // Markdown marker in converted (e.g., **, _, `)
        convIdx++;
      }
    }

    // Map the end position (after last character)
    mapping[plainText.length] = convIdx;

    // Map remaining plain text indices to end
    while (plainIdx < plainText.length) {
      mapping[plainIdx] = converted.length;
      plainIdx++;
    }

    // Apply mapping: entity offsets refer to plain text positions
    return entities.map((entity) => {
      const plainStart = Math.min(entity.offset, plainText.length);
      const plainEnd = Math.min(
        plainText.length,
        entity.offset + entity.length,
      );
      if (plainStart >= plainEnd) {
        return { ...entity, offset: 0, length: 0 };
      }

      const newOffset = mapping[plainStart] ?? 0;
      const newEnd = mapping[plainEnd] ?? converted.length;
      const newLength = Math.max(0, newEnd - newOffset);

      return { ...entity, offset: newOffset, length: newLength };
    });
  }

  /**
   * Parse JSON string of entities with graceful error handling.
   * On parse failure, logs warning and returns empty array.
   */
  private parseEntitiesJson(
    json: string,
    loggerContext: string,
  ): ReadonlyArray<TelegramEntity> {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        this.logger.warn(
          `formattingEntities is not an array, ignoring: ${json}`,
          loggerContext,
        );
        return [];
      }

      // Map Telegram MTProto entities (className) to TelegramEntity (type)
      const entities: TelegramEntity[] = [];

      for (const entity of parsed) {
        // Extract type from className (e.g., "MessageEntityBold" → "bold")
        const type =
          entity.type || this.extractTypeFromClassName(entity.className);

        if (!type) {
          this.logger.warn(
            `Entity missing both type and className, skipping: ${JSON.stringify(entity)}`,
            loggerContext,
          );
          continue;
        }

        entities.push({
          type,
          offset: entity.offset ?? 0,
          length: entity.length ?? 0,
          ...(entity.url && { url: entity.url }),
        });
      }

      return entities;
    } catch (err) {
      this.logger.warn(
        `Failed to parse formattingEntities JSON: ${(err as Error).message}. Falling back to empty array.`,
        loggerContext,
      );
      return [];
    }
  }

  /**
   * Extract entity type from Telegram MTProto className.
   * Examples:
   * - "MessageEntityBold" → "bold"
   * - "MessageEntityItalic" → "italic"
   * - "MessageEntityCode" → "code"
   * - "MessageEntityCustomEmoji" → "custom_emoji" (unsupported, will be ignored)
   */
  private extractTypeFromClassName(
    className: string | undefined,
  ): string | null {
    if (!className) return null;

    // Remove "MessageEntity" prefix
    const type = className.replace(/^MessageEntity/, '');

    // Convert PascalCase to snake_case
    return type
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  /**
   * Resolve overlapping entities by extending outer entities to cover inner ones.
   * When two entities overlap but are not properly nested (one doesn't fully contain the other),
   * and the earlier entity has lower priority (should be outer), extend it to cover the later entity
   * and clip the inner entity to the outer's original boundary.
   */
  private resolveOverlappingEntities(
    entities: ReadonlyArray<TelegramEntity>,
    entityMarkers: Record<
      string,
      { open: string; close: string; priority: number }
    >,
    contentLen: number,
  ): TelegramEntity[] {
    const result: TelegramEntity[] = [];
    const sorted = [...entities].sort((a, b) => {
      if (a.offset !== b.offset) return a.offset - b.offset;
      return b.length - a.length;
    });

    for (const entity of sorted) {
      const { type, offset, length, url } = entity;
      const markers = entityMarkers[type.toLowerCase()];
      if (!markers) continue;

      let start = Math.max(0, Math.min(offset, contentLen));
      let end = Math.min(contentLen, start + length);
      if (start >= end) continue;

      const originalEnd = end;

      // Check against existing entities for overlaps
      for (const existing of result) {
        const exMarkers = entityMarkers[existing.type.toLowerCase()];
        if (!exMarkers) continue;

        const exStart = Math.max(0, Math.min(existing.offset, contentLen));
        const exEnd = Math.min(contentLen, exStart + existing.length);
        if (exStart >= exEnd) continue;

        // Check if they overlap but neither fully contains the other
        const overlaps = start < exEnd && end > exStart;
        const thisContainsExisting = start <= exStart && end >= exEnd;
        const existingContainsThis = exStart <= start && exEnd >= end;

        if (overlaps && !thisContainsExisting && !existingContainsThis) {
          // They overlap but neither contains the other
          // The entity with lower priority (outer) should extend to cover the other
          // The inner entity should be clipped to the outer's original boundary
          if (markers.priority < exMarkers.priority) {
            // Current entity should be outer - extend it to cover existing's end
            if (end < exEnd) end = exEnd;
            if (start > exStart) start = exStart;
            // Clip existing to current's original end
            const existingIdx = result.indexOf(existing);
            if (existingIdx >= 0 && exEnd > originalEnd) {
              result[existingIdx] = {
                ...existing,
                length: Math.min(existing.length, originalEnd - exStart),
              };
            }
          } else if (exMarkers.priority < markers.priority) {
            // Existing entity should be outer - extend it to cover current's original end
            // We need to update the existing entity in result
            const existingIdx = result.indexOf(existing);
            if (existingIdx >= 0 && originalEnd > exEnd) {
              result[existingIdx] = {
                ...existing,
                length: originalEnd - exStart,
              };
            }
            // Clip current to existing's original end
            if (start < exStart) start = exStart;
            if (end > exEnd) end = exEnd;
          }
        }
      }

      result.push({ type, offset: start, length: end - start, url });
    }

    return result;
  }

  /**
   * Apply Telegram entities to content, converting to Markdown.
   * Handles nested entities by building a character-level annotation map.
   */
  private applyEntitiesToContent(
    content: string,
    entities: ReadonlyArray<TelegramEntity>,
  ): string {
    const len = content.length;
    if (len === 0) return content;

    // Map entity type to markdown markers and priority (lower priority number = outer)
    const entityMarkers: Record<
      string,
      { open: string; close: string; priority: number }
    > = {
      bold: { open: '**', close: '**', priority: 10 },
      strong: { open: '**', close: '**', priority: 10 },
      italic: { open: '_', close: '_', priority: 20 },
      emphasis: { open: '_', close: '_', priority: 20 },
      code: { open: '`', close: '`', priority: 30 },
      pre: { open: '\n```\n', close: '\n```\n', priority: 5 },
      text_link: { open: '[', close: '](url)', priority: 40 }, // url handled specially
      underline: { open: '__', close: '__', priority: 15 },
      strikethrough: { open: '~~', close: '~~', priority: 15 },
      spoiler: { open: '||', close: '||', priority: 15 },
    };

    // Pre-process entities: handle overlapping (non-nested) entities by extending
    // outer entities to cover inner ones when they overlap but aren't properly nested
    const processedEntities = this.resolveOverlappingEntities(
      entities,
      entityMarkers,
      len,
    );

    // Build annotation map: for each character position, track open/close markers
    // Allocate len + 1 to handle end positions at the boundary (end == len)
    type Annotation = { open: string; close: string; priority: number };
    const annotations: Annotation[][] = Array.from(
      { length: len + 1 },
      () => [],
    );

    for (const entity of processedEntities) {
      const { type, offset, length, url } = entity;
      const markers = entityMarkers[type.toLowerCase()];
      if (!markers) continue; // Unknown entity type, skip

      let start = Math.max(0, Math.min(offset, len));
      let end = Math.min(len, start + length);
      if (start >= end) continue;

      // Trim leading whitespace from entity content
      // Preserve intended length by extending end accordingly
      let leadingTrimmed = 0;
      while (start < end && /\s/.test(content[start])) {
        start++;
        leadingTrimmed++;
      }
      // Trim trailing whitespace
      while (end > start && /\s/.test(content[end - 1])) {
        end--;
      }
      // Extend end to preserve original non-whitespace length
      if (leadingTrimmed > 0) {
        end = Math.min(len, end + leadingTrimmed);
      }

      // For pre entities, also trim trailing partial words after code endings
      if (type.toLowerCase() === 'pre') {
        const entityContent = content.slice(start, end);
        // Find last code-ending character (}, ), ], ;)
        const codeEndings = ['}', ')', ']', ';'];
        let lastCodeEnd = -1;
        for (const ending of codeEndings) {
          const idx = entityContent.lastIndexOf(ending);
          if (idx > lastCodeEnd) {
            lastCodeEnd = idx;
          }
        }
        // If found, trim everything after it (including whitespace)
        if (lastCodeEnd >= 0) {
          const newEnd = start + lastCodeEnd + 1;
          if (newEnd < end) {
            end = newEnd;
          }
        }
      }

      if (start >= end) continue;

      // For text_link, we need the URL
      const openMarker = markers.open;
      let closeMarker = markers.close;
      if (type.toLowerCase() === 'text_link' && url) {
        closeMarker = `](${url})`;
      }

      // Add annotations at start and end positions
      annotations[start].push({
        open: openMarker,
        close: '',
        priority: markers.priority,
      });
      annotations[end].push({
        open: '',
        close: closeMarker,
        priority: markers.priority,
      });
    }

    // Sort annotations at each position by priority (outer first)
    for (const posAnnotations of annotations) {
      posAnnotations.sort((a, b) => a.priority - b.priority);
    }

    // Build output by walking through content and applying markers at boundaries
    let result = '';
    for (let i = 0; i < len; i++) {
      // Close markers that END at this position (before this character)
      // Entities ending at position i have their close marker applied BEFORE content[i]
      if (annotations[i]?.some((a) => a.close)) {
        const closeMarkers = annotations[i]
          .filter((a) => a.close)
          .sort((a, b) => b.priority - a.priority)
          .map((a) => a.close)
          .join('');
        result += closeMarkers;
      }

      // Apply open markers before the character
      if (annotations[i]?.some((a) => a.open)) {
        const openMarkers = annotations[i]
          .filter((a) => a.open)
          .sort((a, b) => a.priority - b.priority)
          .map((a) => a.open)
          .join('');
        result += openMarkers;
      }

      // Add the character
      result += content[i];
    }

    // Close any remaining markers at the end
    const finalCloseMarkers = annotations[len]?.length
      ? annotations[len]
          .filter((a) => a.close)
          .sort((a, b) => b.priority - a.priority)
          .map((a) => a.close)
          .join('')
      : '';
    result += finalCloseMarkers;

    // Now process any HTML tags in the result
    return this.convertHtmlToMarkdown(result);
  }

  /**
   * Check if HTML content has well-formed tags (balanced and properly nested).
   * Returns true if well-formed, false if malformed.
   */
  private isHtmlWellFormed(content: string): boolean {
    const tagStack: string[] = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(content)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      const isClosing = fullTag.startsWith('</');
      const isSelfClosing = fullTag.endsWith('/>');

      // Skip self-closing tags
      if (isSelfClosing) continue;

      // Skip known void elements
      if (['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName))
        continue;

      if (isClosing) {
        if (
          tagStack.length === 0 ||
          tagStack[tagStack.length - 1] !== tagName
        ) {
          return false; // Mismatched closing tag
        }
        tagStack.pop();
      } else {
        tagStack.push(tagName);
      }
    }

    return tagStack.length === 0; // All tags closed
  }

  /**
   * Convert basic HTML tags to Markdown.
   * Handles: <b>/<strong>, <i>/<em>, <code>, <a>, <pre>
   * Malformed HTML falls back to plain text (strips tags).
   */
  private convertHtmlToMarkdown(content: string): string {
    if (!content) return content;

    // If HTML is malformed, strip all tags and return plain text
    if (!this.isHtmlWellFormed(content)) {
      return content.replace(/<[^>]+>/g, '');
    }

    try {
      let result = content;

      // Handle <pre>...</pre> → ```...```
      result = result.replace(
        /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi,
        (_, inner: string) => {
          const cleaned = inner.replace(/<\/?[^>]+>/g, '').trim(); // Strip nested tags and trim
          return `\n\`\`\`\n${cleaned}\n\`\`\`\n`;
        },
      );

      // Handle <code>...</code> → `...`
      result = result.replace(
        /<code\b[^>]*>([\s\S]*?)<\/code>/gi,
        (_, inner: string) => {
          const cleaned = inner.replace(/<\/?[^>]+>/g, '');
          return `\`${cleaned}\``;
        },
      );

      // Handle <a href="...">...</a> → [...](...)
      result = result.replace(
        /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_, href: string, inner: string) => {
          const cleaned = inner.replace(/<\/?[^>]+>/g, '');
          return `[${cleaned}](${href})`;
        },
      );

      // Handle <b>...</b> or <strong>...</strong> → **...**
      result = result.replace(/<\/?(b|strong)\b[^>]*>/gi, (match) =>
        match.startsWith('</') ? '**' : '**',
      );

      // Handle <i>...</i> or <em>...</em> → _..._ (consistent with entity italic)
      result = result.replace(/<\/?(i|em)\b[^>]*>/gi, (match) =>
        match.startsWith('</') ? '_' : '_',
      );

      // Handle <u>...</u> → __...__
      result = result.replace(/<\/?u\b[^>]*>/gi, (match) =>
        match.startsWith('</') ? '__' : '__',
      );

      // Handle <s>...</s> or <strike>...</strike> or <del>...</del> → ~~...~~
      result = result.replace(/<\/?(s|strike|del)\b[^>]*>/gi, (match) =>
        match.startsWith('</') ? '~~' : '~~',
      );

      // Handle <span class="tg-spoiler">...</span> → ||...||
      result = result.replace(
        /<span\b[^>]*class\s*=\s*["'][^"']*tg-spoiler[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
        (_, inner: string) => `||${inner.replace(/<\/?[^>]+>/g, '')}||`,
      );

      // Strip any remaining HTML tags (malformed or unsupported)
      result = result.replace(/<[^>]+>/g, '');

      return result;
    } catch (err) {
      // Malformed HTML - fallback to stripping all tags
      this.logger.warn(
        `HTML to Markdown conversion failed: ${(err as Error).message}. Stripping tags.`,
        MarkdownConverter.name,
      );
      return content.replace(/<[^>]+>/g, '');
    }
  }
}
