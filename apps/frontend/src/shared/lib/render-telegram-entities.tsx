import React from 'react';

interface TextEntity {
  offset: number;
  length: number;
  type: string;
  url?: string | null;
}

export function renderFormattedText(
  content: string,
  entities?: readonly TextEntity[] | null,
): React.ReactNode {
  // 1. If no entities, return plain text
  if (!entities || entities.length === 0) {
    return <>{content}</>;
  }

  // 2. Sort entities by offset
  const sorted = [...entities].sort((a, b) => a.offset - b.offset);

  // 3. Build segments with their entity styling
  const segments: Array<{
    start: number;
    end: number;
    text: string;
    entity: TextEntity | null;
  }> = [];

  let cursor = 0;
  for (const entity of sorted) {
    // Clamp entity to content bounds
    const start = Math.max(entity.offset, cursor);
    const end = Math.min(entity.offset + entity.length, content.length);

    if (start >= content.length) break;

    // Add plain segment before this entity (if any)
    if (start > cursor) {
      segments.push({
        start: cursor,
        end: start,
        text: content.slice(cursor, start),
        entity: null,
      });
    }

    // Skip if entity is out of bounds
    if (start >= content.length || end <= start) continue;

    // Add entity segment
    segments.push({
      start,
      end,
      text: content.slice(start, end),
      entity,
    });

    cursor = end;
  }

  // Add remaining text after last entity
  if (cursor < content.length) {
    segments.push({
      start: cursor,
      end: content.length,
      text: content.slice(cursor),
      entity: null,
    });
  }

  // 4. Render segments
  return (
    <>
      {segments.map((seg, i) => {
        if (!seg.entity)
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        switch (seg.entity.type) {
          case 'url':
          case 'text_url':
            return (
              <a
                key={i}
                href={seg.entity.url ?? seg.text}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                {seg.text}
              </a>
            );
          case 'bold':
            return <strong key={i}>{seg.text}</strong>;
          case 'italic':
            return <em key={i}>{seg.text}</em>;
          case 'code':
            return (
              <code
                key={i}
                className="rounded bg-slate-700 px-1 py-0.5 text-xs font-mono"
              >
                {seg.text}
              </code>
            );
          case 'pre':
            return (
              <pre
                key={i}
                className="rounded bg-slate-700 p-2 text-xs overflow-x-auto"
              >
                {seg.text}
              </pre>
            );
          case 'strike':
            return <del key={i}>{seg.text}</del>;
          case 'underline':
            return <u key={i}>{seg.text}</u>;
          case 'spoiler':
            return (
              <span key={i} className="spoiler">
                {seg.text}
              </span>
            );
          case 'mention':
            return (
              <span key={i} className="text-blue-400">
                {seg.text}
              </span>
            );
          default:
            return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        }
      })}
    </>
  );
}
