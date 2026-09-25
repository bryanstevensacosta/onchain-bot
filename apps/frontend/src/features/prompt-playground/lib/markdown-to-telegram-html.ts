/**
 * Minimal Markdown → Telegram-HTML converter for the playground preview.
 *
 * The publisher sends `parse_mode: HTML`, so real posts must use `<b>`,
 * `<i>`, … — but drafts under test may allow Markdown, and judging raw
 * asterisks is painful. This converts the common subset to the Telegram
 * allowlist (mirrored by `SchedulingHtmlPreview`) so "Vista previa" shows
 * formatting either way. Existing HTML tags pass through untouched.
 */
const CODE_FENCE_REGEX = /```(\w*)\n([\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const LINK_REGEX = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BOLD_STAR_REGEX = /\*\*([^*\n]+)\*\*/g;
const BOLD_UNDER_REGEX = /__([^_\n]+)__/g;
const ITALIC_STAR_REGEX = /(?<!\w)\*([^*\n]+)\*(?!\w)/g;
const ITALIC_UNDER_REGEX = /(?<!\w)_([^_\n]+)_(?!\w)/g;
const STRIKE_REGEX = /~~([^~\n]+)~~/g;
const HEADING_REGEX = /^#{1,6}\s+(.+)$/gm;
const BULLET_REGEX = /^(\s*)[-*]\s+(.+)$/gm;
const QUOTE_LINE_REGEX = /^>\s?(.*)$/gm;
const ADJACENT_QUOTES_REGEX = /<\/blockquote>\n<blockquote>/g;
// ASCII-only fence placeholder: must not contain *, _, ~, `, # or [,
// otherwise the conversions below would rewrite it.
const FENCE_TOKEN = (i: number): string => `ZXFENCE${i}XZ`;
const FENCE_RESTORE_REGEX = /ZXFENCE(\d+)XZ/g;

export function markdownToTelegramHtml(input: string): string {
  // Extract fences first so inner markdown survives the conversions below.
  const fences: string[] = [];
  const withoutFences = input.replace(
    CODE_FENCE_REGEX,
    (_, lang: string, code: string) => {
      void lang;
      fences.push(`<pre>${code.replace(/\n$/, '')}</pre>`);
      return FENCE_TOKEN(fences.length - 1);
    },
  );
  const converted = withoutFences
    .replace(INLINE_CODE_REGEX, '<code>$1</code>')
    .replace(LINK_REGEX, '<a href="$2">$1</a>')
    .replace(BOLD_STAR_REGEX, '<b>$1</b>')
    .replace(BOLD_UNDER_REGEX, '<b>$1</b>')
    .replace(ITALIC_STAR_REGEX, '<i>$1</i>')
    .replace(ITALIC_UNDER_REGEX, '<i>$1</i>')
    .replace(STRIKE_REGEX, '<s>$1</s>')
    .replace(HEADING_REGEX, '<b>$1</b>')
    .replace(BULLET_REGEX, '$1• $2')
    .replace(QUOTE_LINE_REGEX, '<blockquote>$1</blockquote>');
  return converted
    .replace(ADJACENT_QUOTES_REGEX, '\n')
    .replace(FENCE_RESTORE_REGEX, (_, i: string) => fences[Number(i)]);
}
