/**
 * Pure domain service for normalizing content.
 *
 * NO NestJS decorators, NO TypeORM, NO IO.
 */

const SENTENCE_STARTERS = new Set([
  'This',
  'That',
  'These',
  'Those',
  'However',
  'Therefore',
  'Meanwhile',
  'Furthermore',
  'Moreover',
  'Nevertheless',
  'Additionally',
  'Also',
  'But',
  'So',
  'When',
  'Where',
  'Why',
  'How',
  'What',
  'Who',
  'Whom',
  'Whose',
  'Which',
  'Here',
  'There',
  'Then',
  'Now',
  'Just',
  'After',
  'Before',
  'While',
  'Since',
  'Until',
  'Though',
  'Because',
  'Hence',
  'Thus',
]);

/**
 * Normalizes content for deduplication purposes.
 *
 * Pipeline:
 * 1. Strip markdown: remove *, _, `, ~~, ||, [](), ![]()
 * 2. Extract URLs first (save for later)
 * 3. Remove emojis
 * 4. Remove accents (NFKD normalize + strip combining marks)
 * 5. Lowercase
 * 6. Collapse repeated punctuation
 * 7. Remove leading/trailing punctuation
 * 8. Collapse whitespace
 * 9. Trim
 */
export class ContentNormalizerService {
  /**
   * Normalizes content for deduplication.
   */
  public static normalize(content: string): string {
    let result = content;

    // 1. Strip markdown: *, _, `, ~~, ||, [](), ![]()
    // Remove || (spoiler) first
    result = result.replace(/\|\|/g, '');
    // Remove [](link) markdown links - preserve inner text
    result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    // Remove ![](image) markdown images - preserve inner text if alt exists
    result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    // Remove markdown formatting symbols that aren't part of regular text:
    // - Double asterisks for bold (word boundary on both sides)
    // - Single underscores for italic
    // - Single backticks for code
    // - Double tildes for strikethrough
    result = result
      .replace(/\*\*/g, '')
      .replace(/(?<!\w)\*(?!\w)/g, '')
      .replace(/(?<!\w)_(?!\w)/g, '')
      .replace(/(?<!\w)`(?!\w)/g, '')
      .replace(/~~/g, '');

    // 2. Extract URLs first - temporarily replace to not normalize within text
    const urlMatches: string[] = [];
    const urlRegex = /https?:\/\/\S+/g;
    let urlIndex = 0;
    result = result.replace(urlRegex, (match) => {
      const placeholder = `__URL_PLACEHOLDER_${urlIndex}__`;
      urlMatches.push(match);
      urlIndex++;
      return placeholder;
    });

    // 3. Remove emojis
    result = result.replace(/\p{Extended_Pictographic}/gu, '');

    // 4. Remove accents: NFKD normalize + strip combining marks
    result = result.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    // 5. Lowercase
    result = result.toLowerCase();

    // 6. Collapse repeated punctuation
    result = result.replace(/([!?.,;:])\1+/g, '$1');

    // 7. Trim leading/trailing punctuation (but preserve $ # @ / .)
    result = result.replace(/^[!?.,;:]+|[!?.,;:]+$/g, '');

    // 8. Collapse whitespace
    result = result.replace(/\s+/g, ' ');

    // 9. Trim
    result = result.trim();

    return result;
  }

  /**
   * Extracts all numbers from content, converting suffixes.
   *
   * - K → ×1000
   * - M → ×1000000
   * - B → ×1000000000
   * - T → ×1000000000000
   * - % → keep as percentage (multiply by 0.01)
   *
   * Handles both decimal separators: 1.5 and 1,5 → 1.5
   */
  public static extractNumbers(content: string): number[] {
    const numbers: number[] = [];
    // Number match: thousands-grouped (\d{1,3}(?:,\d{3})+) OR plain
    // (\d+(?:[.,]\d+)?). The negative lookahead (?![A-Za-z]) on the suffix
    // group prevents the suffix from matching the first letter of the next
    // word (e.g. 'B' of 'BTC', 't' of 'today').
    const regex =
      /(\d{1,3}(?:,\d{3})+|\d+(?:[.,]\d+)?)\s*(?:([kKmMbBtT%]))?(?![A-Za-z])/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      let numStr = match[1];
      const suffix = match[2]?.toUpperCase() || '';

      if (/^\d{1,3}(,\d{3})+$/.test(numStr)) {
        numStr = numStr.replace(/,/g, '');
      } else if (numStr.includes(',')) {
        numStr = numStr.replace(',', '.');
      }

      let value = parseFloat(numStr);

      // Apply suffix multipliers
      switch (suffix) {
        case 'K':
          value *= 1000;
          break;
        case 'M':
          value *= 1000000;
          break;
        case 'B':
          value *= 1000000000;
          break;
        case 'T':
          value *= 1000000000000;
          break;
        case '%':
          value *= 0.01;
          break;
      }

      if (!isNaN(value)) {
        numbers.push(value);
      }
    }

    return numbers;
  }

  /**
   * Extracts capitalized entities from content.
   *
   * - No stemming: just lowercase, trim
   * - Filters words ≤3 chars
   * - Filters sentence starters
   * - Returns unique, sorted
   */
  public static extractEntities(content: string): string[] {
    const regex = /\b([A-Z][a-záéíóú]+(?:[A-Z][a-záéíóú]+)*)\b/g;
    const entities: string[] = [];
    const seen = new Set<string>();

    let match;
    while ((match = regex.exec(content)) !== null) {
      const word = match[1];

      // Filter: words ≤3 chars
      if (word.length <= 3) continue;

      // Filter: sentence starters
      if (SENTENCE_STARTERS.has(word)) continue;

      // Lowercase and trim
      const normalized = word.toLowerCase().trim();

      // Unique
      if (!seen.has(normalized)) {
        seen.add(normalized);
        entities.push(normalized);
      }
    }

    // Sort
    return entities.sort();
  }

  /**
   * Extracts cashtags ($TICKER) from content.
   *
   * - 2-10 alphanumeric characters after $
   * - Uppercase, unique, sorted
   */
  public static extractCashtags(content: string): string[] {
    const regex = /\$([A-Za-z]{2,10})\b/g;
    const cashtags: string[] = [];
    const seen = new Set<string>();

    let match;
    while ((match = regex.exec(content)) !== null) {
      const ticker = match[1].toUpperCase();

      if (!seen.has(ticker)) {
        seen.add(ticker);
        cashtags.push(ticker);
      }
    }

    return cashtags.sort();
  }
}
