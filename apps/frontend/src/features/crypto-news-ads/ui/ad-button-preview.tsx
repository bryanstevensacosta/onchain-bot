import type { ReactElement } from 'react';

/**
 * Inline-keyboard button preview for the ad-body editor.
 *
 * The backend converts EVERY `<a href="…">label</a>` anchor in the ad body
 * into an inline keyboard button (rows of 3, capped at 6) when the ad is
 * published. This preview gives the operator live feedback on how many
 * buttons will be attached — mirroring the backend's extraction semantics so
 * the count matches what actually publishes. Pure derivation from `body`: no
 * hooks, no server state, no `dangerouslySetInnerHTML`.
 */

/** Maximum inline keyboard buttons the backend attaches to one ad. */
const MAX_BUTTONS = 6;

/** Anchor extraction regex — mirrors the backend verbatim. */
const ANCHOR_REGEX = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

export interface AdAnchor {
  label: string;
  url: string;
}

/** Fallback label when an anchor has empty text (backend default). */
const FALLBACK_LABEL = 'Abrir';

/**
 * Extract the `<a href>` anchors of an ad body as inline-button candidates.
 * Labels are trimmed and fall back to `Abrir` when empty; capped at
 * `MAX_BUTTONS` to mirror backend behavior.
 */
export function extractAdAnchors(body: string): AdAnchor[] {
  const anchors: AdAnchor[] = [];
  let match: RegExpExecArray | null;
  while (
    (match = ANCHOR_REGEX.exec(body)) !== null &&
    anchors.length < MAX_BUTTONS
  ) {
    const label = match[2].trim() || FALLBACK_LABEL;
    anchors.push({ label, url: match[1] });
  }
  return anchors;
}

/**
 * Live preview of the inline keyboard buttons the backend will attach to the
 * ad. Renders nothing when the body has no anchors; otherwise shows a
 * `Buttons (N)` label and a wrapped row of disabled-looking button-styled
 * links (the URL stays inspectable on hover via `title`).
 */
export function AdButtonPreview({
  body,
}: {
  body: string;
}): ReactElement | null {
  const anchors = extractAdAnchors(body);
  if (anchors.length === 0) {
    return null;
  }
  return (
    <div className="mt-2">
      <span className="block text-xs uppercase text-slate-500 mb-1">
        Buttons ({anchors.length})
      </span>
      <div className="flex flex-wrap gap-1">
        {anchors.map(({ label, url }) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            className="px-2 py-1 rounded text-xs border bg-slate-800 text-slate-300 border-slate-700"
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
