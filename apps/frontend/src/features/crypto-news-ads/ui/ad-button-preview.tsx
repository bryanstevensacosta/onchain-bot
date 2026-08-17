import type { ReactElement } from 'react';
import type { AdButton } from '@/features/crypto-news-ads/api/ads-api';

/**
 * Live preview of the inline keyboard buttons configured for the ad.
 *
 * Buttons are an explicit, operator-configured list (`ad.buttons`) — NOT
 * extracted from `<a href>` anchors in the body. The parent modal owns the
 * editor state and passes the current rows here. Renders nothing when no
 * buttons are configured (the ad publishes without a keyboard). Pure: no
 * hooks, no server state, no `dangerouslySetInnerHTML`.
 */
export function AdButtonPreview({
  buttons,
}: {
  buttons: ReadonlyArray<AdButton>;
}): ReactElement | null {
  if (buttons.length === 0) {
    return null;
  }
  return (
    <div className="mt-2">
      <span className="block text-xs uppercase text-slate-500 mb-1">
        Buttons ({buttons.length})
      </span>
      <div className="flex flex-wrap gap-1">
        {buttons.map((button, index) => (
          <a
            key={index}
            href={button.url}
            target="_blank"
            rel="noopener noreferrer"
            title={button.url}
            className="px-2 py-1 rounded text-xs border bg-slate-800 text-slate-300 border-slate-700"
          >
            {button.text}
          </a>
        ))}
      </div>
    </div>
  );
}
