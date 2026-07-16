const URL_REGEX = /(^|[\s\n(])https?:\/\/[^\s\n()<>"']+/gi;
const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\((https?:\/\/[^\s\n()<>"']+)\)/gi;

interface MarkdownLink {
  start: number;
  end: number;
  urlStart: number;
  urlEnd: number;
  url: string;
}

function findMarkdownLinks(text: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  let match;
  while ((match = MARKDOWN_LINK_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const urlPart = match[2];
    const urlStartInFull = fullMatch.indexOf('(') + 1;
    const urlStart = match.index + urlStartInFull;
    const urlEnd = match.index + fullMatch.lastIndexOf(')');
    links.push({
      start: match.index,
      end: match.index + fullMatch.length,
      urlStart,
      urlEnd,
      url: urlPart,
    });
  }
  return links;
}

function isUrlInMarkdownLink(url: string, links: MarkdownLink[]): boolean {
  for (const link of links) {
    if (link.url === url) {
      return true;
    }
  }
  return false;
}

function trimTrailingPunctuation(url: string): {
  url: string;
  trailing: string;
} {
  const punctuationRegex = /([.,;:!?]+)$/;
  const match = url.match(punctuationRegex);

  if (match) {
    return {
      url: url.slice(0, -match[1].length),
      trailing: match[1],
    };
  }

  return { url, trailing: '' };
}

export function formatUrlsAsMarkdown(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const existingLinks = findMarkdownLinks(text);

  const result = text.replace(URL_REGEX, (match, prefix, offset) => {
    const url = match.slice(prefix.length);

    if (isUrlInMarkdownLink(url, existingLinks)) {
      return match;
    }

    const { url: trimmedUrl, trailing } = trimTrailingPunctuation(url);

    return `${prefix}[${trimmedUrl}](${trimmedUrl})${trailing}`;
  });

  return result;
}
