import { Injectable } from '@nestjs/common';

const SENTENCE_STARTERS = new Set([
  'the',
  'this',
  'that',
  'these',
  'those',
  'and',
  'for',
  'with',
  'from',
  'after',
  'before',
  'just',
  'now',
  'here',
  'there',
]);

/**
 * Content normalizer (moved from backend shared/deduplication, todo 4).
 *
 * Canonical form for the content-hash stage: spoiler/emphasis/markdown
 * stripped, URLs removed, emoji + diacritics folded, lowercased,
 * repeated punctuation collapsed, edge punctuation trimmed ($#@/. kept).
 * Pure and side-effect free.
 */
@Injectable()
export class ContentNormalizerService {
  public normalize(raw: string): string {
    let text = raw ?? '';
    text = text.replace(/\|\|/g, '');
    text = text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1');
    text = text.replace(/(^|\W)\*\*([^*]+)\*\*/g, '$1$2');
    text = text.replace(/(^|\W)\*([^*\n]+)\*/g, '$1$2');
    text = text.replace(/(^|\W)_([^_\n]+)_/g, '$1$2');
    text = text.replace(/~([^~\n]+)~/g, '$1');
    text = text.replace(/https?:\/\/\S+/g, '');
    text = text.replace(/\p{Extended_Pictographic}/gu, '');
    text = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    text = text.toLowerCase();
    text = text.replace(/([!?.,;:])\1+/g, '$1');
    text = text.replace(/^[^a-z0-9$#@/.]+|[^a-z0-9$#@/.]+$/g, '');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  public tokens(normalized: string): string[] {
    return normalized.split(' ').filter((t) => t.length > 0);
  }

  public extractNumbers(raw: string): number[] {
    const out: number[] = [];
    const re = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kmbt%])/gi;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((match = re.exec(raw)) !== null) {
      const rawNumber = match[1].replace(/,/g, '');
      const suffix = match[2].toLowerCase();
      const next = raw[match.index + match[0].length];
      if (/[a-z]/i.test(next ?? '')) {
        continue;
      }
      const base = Number(rawNumber);
      if (!Number.isFinite(base)) {
        continue;
      }
      const key = `${base}${suffix}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const multiplier =
        suffix === 'k'
          ? 1_000
          : suffix === 'm'
            ? 1_000_000
            : suffix === 'b'
              ? 1_000_000_000
              : suffix === 't'
                ? 1_000_000_000_000
                : 0.01;
      out.push(base * multiplier);
    }
    return out;
  }

  public extractEntities(raw: string): string[] {
    const found = new Set<string>();
    const re = /\b([A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,})*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
      const entity = match[1].toLowerCase();
      if (SENTENCE_STARTERS.has(entity.split(' ')[0])) {
        continue;
      }
      found.add(entity);
    }
    return [...found].sort();
  }

  public extractCashtags(raw: string): string[] {
    const found = new Set<string>();
    const re = /\$([A-Za-z]{2,10})\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
      found.add(match[1].toUpperCase());
    }
    return [...found].sort();
  }
}
