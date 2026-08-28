import {
  MarkdownConverter,
  TelegramEntity,
} from '../markdown-converter.service';

describe('MarkdownConverter', () => {
  let converter: MarkdownConverter;

  beforeEach(() => {
    converter = new MarkdownConverter();
  });

  const createEntity = (
    overrides: Partial<TelegramEntity> = {},
  ): TelegramEntity => ({
    type: 'bold',
    offset: 0,
    length: 4,
    url: null,
    ...overrides,
  });

  describe('basic entity conversion', () => {
    it('should convert bold entity to **bold**', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello **world**');
    });

    it('should convert italic entity to _italic_', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'italic', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello _world_');
    });

    it('should convert code entity to `code`', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'code', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello `world`');
    });

    it('should convert pre entity to ```pre```', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'pre', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello \n```\nworld\n```\n');
    });

    it('should convert text_link entity to [text](url)', () => {
      const content = 'Visit example';
      const entities: TelegramEntity[] = [
        createEntity({
          type: 'text_link',
          offset: 6,
          length: 7,
          url: 'https://example.com',
        }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Visit [example](https://example.com)');
    });

    it('should convert strong entity (alias for bold)', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'strong', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello **world**');
    });

    it('should convert emphasis entity (alias for italic)', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'emphasis', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello _world_');
    });

    it('should convert underline entity to __underline__', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'underline', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello __world__');
    });

    it('should convert strikethrough entity to ~~strikethrough~~', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'strikethrough', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello ~~world~~');
    });

    it('should convert spoiler entity to ||spoiler||', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'spoiler', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello ||world||');
    });
  });

  describe('multiple entities', () => {
    it('should handle multiple non-overlapping entities', () => {
      const content = 'Hello bold and italic world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 6, length: 4 }),
        createEntity({ type: 'italic', offset: 15, length: 6 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello **bold** and _italic_ world');
    });

    it('should handle adjacent entities', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 0, length: 5 }),
        createEntity({ type: 'italic', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('**Hello** _world_');
    });
  });

  describe('nested entities', () => {
    it('should handle nested bold and italic: <b><i>text</i></b> → **_text_**', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 6, length: 5 }),
        createEntity({ type: 'italic', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello **_world_**');
    });

    it('should handle triple nested: bold > italic > code', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 6, length: 5 }),
        createEntity({ type: 'italic', offset: 6, length: 5 }),
        createEntity({ type: 'code', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello **_`world`_**');
    });

    it('should handle partial overlap (nested start)', () => {
      const content = 'Hello beautiful world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 6, length: 15 }), // "beautiful world"
        createEntity({ type: 'italic', offset: 6, length: 9 }), // "beautiful"
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello **_beautiful_ world**');
    });

    it('should handle partial overlap (nested end)', () => {
      const content = 'Hello beautiful world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 6, length: 15 }), // "beautiful world"
        createEntity({ type: 'italic', offset: 16, length: 5 }), // "world"
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello **beautiful _world_**');
    });
  });

  describe('overlapping entities (non-nested)', () => {
    it('should handle overlapping but not nested entities', () => {
      const content = 'Hello world test';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 0, length: 11 }), // "Hello world"
        createEntity({ type: 'italic', offset: 6, length: 10 }), // "world test"
      ];
      const result = converter.convertToMarkdown(content, entities);
      // Bold starts first (priority 10), then italic (priority 20) inside
      // Expected: **Hello _world_ test**
      expect(result).toBe('**Hello _world_ test**');
    });
  });

  describe('HTML tag conversion', () => {
    it('should convert <b> to **', () => {
      const content = 'Hello <b>world</b>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello **world**');
    });

    it('should convert <strong> to **', () => {
      const content = 'Hello <strong>world</strong>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello **world**');
    });

    it('should convert <i> to _', () => {
      const content = 'Hello <i>world</i>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello _world_');
    });

    it('should convert <em> to _', () => {
      const content = 'Hello <em>world</em>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello _world_');
    });

    it('should convert <code> to `', () => {
      const content = 'Hello <code>world</code>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello `world`');
    });

    it('should convert <pre> to ```', () => {
      const content = 'Hello <pre>world</pre>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello \n```\nworld\n```\n');
    });

    it('should convert <a href="url">text</a> to [text](url)', () => {
      const content = 'Hello <a href="https://example.com">world</a>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello [world](https://example.com)');
    });

    it('should convert <u> to __', () => {
      const content = 'Hello <u>world</u>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello __world__');
    });

    it('should convert <s> to ~~', () => {
      const content = 'Hello <s>world</s>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello ~~world~~');
    });

    it('should convert <strike> to ~~', () => {
      const content = 'Hello <strike>world</strike>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello ~~world~~');
    });

    it('should convert <del> to ~~', () => {
      const content = 'Hello <del>world</del>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello ~~world~~');
    });

    it('should convert <span class="tg-spoiler"> to ||', () => {
      const content = 'Hello <span class="tg-spoiler">world</span>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello ||world||');
    });

    it('should handle nested HTML tags', () => {
      const content = 'Hello <b><i>world</i></b>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello **_world_**');
    });

    it('should handle HTML with attributes', () => {
      const content = 'Hello <b class="bold">world</b>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello **world**');
    });
  });

  describe('combined entities and HTML', () => {
    it('should process both entities and HTML tags', () => {
      const content = 'Hello <b>world</b>';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'italic', offset: 6, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      // HTML processed first, then entities on result
      expect(result).toBe('Hello **_world_**');
    });
  });

  describe('malformed HTML handling', () => {
    it('should fallback to plain text for unclosed tags', () => {
      const content = 'Hello <b>world';
      const result = converter.convertToMarkdown(content);
      // Unclosed tag gets stripped
      expect(result).toBe('Hello world');
    });

    it('should fallback to plain text for malformed nested tags', () => {
      const content = 'Hello <b><i>world</b></i>';
      const result = converter.convertToMarkdown(content);
      // Malformed - tags stripped
      expect(result).toBe('Hello world');
    });

    it('should handle completely broken HTML', () => {
      const content = 'Hello <b>world <i>test</b> more</i>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello world test more');
    });

    it('should handle self-closing tags gracefully', () => {
      const content = 'Hello <br/>world';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello world');
    });

    it('should handle unknown tags by stripping', () => {
      const content = 'Hello <unknown>world</unknown>';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello world');
    });
  });

  describe('JSON entities parsing', () => {
    it('should parse valid JSON entities string', () => {
      const content = 'Hello world';
      const formattingEntitiesJson = JSON.stringify([
        { type: 'bold', offset: 6, length: 5, url: null },
      ]);
      const result = converter.convertToMarkdown(
        content,
        undefined,
        formattingEntitiesJson,
      );
      expect(result).toBe('Hello **world**');
    });

    it('should handle multiple entities in JSON', () => {
      const content = 'Hello bold and italic world';
      const formattingEntitiesJson = JSON.stringify([
        { type: 'bold', offset: 6, length: 4, url: null },
        { type: 'italic', offset: 15, length: 6, url: null },
      ]);
      const result = converter.convertToMarkdown(
        content,
        undefined,
        formattingEntitiesJson,
      );
      expect(result).toBe('Hello **bold** and _italic_ world');
    });

    it('should handle text_link with URL in JSON', () => {
      const content = 'Visit example';
      const formattingEntitiesJson = JSON.stringify([
        { type: 'text_link', offset: 6, length: 7, url: 'https://example.com' },
      ]);
      const result = converter.convertToMarkdown(
        content,
        undefined,
        formattingEntitiesJson,
      );
      expect(result).toBe('Visit [example](https://example.com)');
    });

    it('should fallback to empty array for invalid JSON', () => {
      const content = 'Hello world';
      const formattingEntitiesJson = '{invalid json}';
      const result = converter.convertToMarkdown(
        content,
        undefined,
        formattingEntitiesJson,
      );
      // Should not crash, just treat as no entities
      expect(result).toBe('Hello world');
    });

    it('should fallback to empty array for non-array JSON', () => {
      const content = 'Hello world';
      const formattingEntitiesJson = JSON.stringify({ not: 'an array' });
      const result = converter.convertToMarkdown(
        content,
        undefined,
        formattingEntitiesJson,
      );
      expect(result).toBe('Hello world');
    });

    it('should fallback to empty array for null JSON', () => {
      const content = 'Hello world';
      const result = converter.convertToMarkdown(content, undefined, null);
      expect(result).toBe('Hello world');
    });

    it('should fallback to empty array for undefined JSON', () => {
      const content = 'Hello world';
      const result = converter.convertToMarkdown(content, undefined, undefined);
      expect(result).toBe('Hello world');
    });

    it('should fallback to empty array for empty string JSON', () => {
      const content = 'Hello world';
      const result = converter.convertToMarkdown(content, undefined, '');
      expect(result).toBe('Hello world');
    });

    it('should combine entities and JSON entities', () => {
      const content = 'Hello world test';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 0, length: 5 }),
      ];
      const formattingEntitiesJson = JSON.stringify([
        { type: 'italic', offset: 11, length: 4, url: null },
      ]);
      const result = converter.convertToMarkdown(
        content,
        entities,
        formattingEntitiesJson,
      );
      expect(result).toBe('**Hello** world _test_');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty content', () => {
      const result = converter.convertToMarkdown('');
      expect(result).toBe('');
    });

    it('should return content unchanged when no entities or HTML', () => {
      const content = 'Hello world';
      const result = converter.convertToMarkdown(content);
      expect(result).toBe('Hello world');
    });

    it('should handle entities at the very start', () => {
      const content = 'Hello';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 0, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('**Hello**');
    });

    it('should handle entities at the very end', () => {
      const content = 'Hello';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 0, length: 5 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('**Hello**');
    });

    it('should handle entity covering entire content', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 0, length: 11 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('**Hello world**');
    });

    it('should handle zero-length entity', () => {
      const content = 'Hello world';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 5, length: 0 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('Hello world');
    });

    it('should handle entity extending beyond content length', () => {
      const content = 'Hi';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: 0, length: 10 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('**Hi**');
    });

    it('should handle negative offset (clamped to 0)', () => {
      const content = 'Hello';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'bold', offset: -5, length: 10 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toBe('**Hello**');
    });
  });

  describe('parseEntitiesJson option', () => {
    it('should skip JSON parsing when parseEntitiesJson is false', () => {
      const content = 'Hello world';
      const formattingEntitiesJson = JSON.stringify([
        { type: 'bold', offset: 6, length: 5, url: null },
      ]);
      const result = converter.convertToMarkdown(
        content,
        undefined,
        formattingEntitiesJson,
        {
          parseEntitiesJson: false,
        },
      );
      expect(result).toBe('Hello world');
    });
  });

  describe('pre/code block handling', () => {
    it('should handle pre with newlines', () => {
      const content = 'Code:\nfunction test() {}\nEnd';
      const entities: TelegramEntity[] = [
        createEntity({ type: 'pre', offset: 6, length: 21 }),
      ];
      const result = converter.convertToMarkdown(content, entities);
      expect(result).toContain('```\nfunction test() {}\n```');
    });

    it('should handle HTML pre with newlines', () => {
      const content = 'Code:\n<pre>function test() {}</pre>\nEnd';
      const result = converter.convertToMarkdown(content);
      expect(result).toContain('```\nfunction test() {}\n```');
    });
  });
});
