import { useState } from 'react';

interface SourceOption {
  channelId: string;
  title: string | null;
  handle: string | null;
}

function sourceLabel(s: SourceOption): string {
  return s.title ?? s.handle ?? s.channelId;
}

function SourceMultiSelect({
  ids,
  onChange,
  sourceOptions,
  disabled,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  sourceOptions: ReadonlyArray<SourceOption>;
  disabled?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const isGlobal = ids.length === 0;

  const label = isGlobal
    ? 'All sources (global)'
    : ids.length === 1
      ? sourceOptions.find((s) => s.channelId === ids[0])
        ? sourceLabel(sourceOptions.find((s) => s.channelId === ids[0])!)
        : '1 source'
      : `${ids.length} sources`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
      >
        <span className="truncate">{label}</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            ref={(el) => {
              if (!el || typeof window === 'undefined') return;
              const btn = el.parentElement?.querySelector('button');
              if (!btn) return;
              const rect = btn.getBoundingClientRect();
              el.style.position = 'fixed';
              el.style.top = `${rect.bottom + 4}px`;
              el.style.left = `${rect.left}px`;
              el.style.width = `${rect.width}px`;
            }}
            className="z-20 max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded shadow-lg p-1.5 space-y-0.5"
          >
            <label className="flex items-center gap-2 px-2 py-1 rounded text-sm text-slate-300 cursor-pointer hover:bg-slate-700/50">
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={() => onChange([])}
                disabled={disabled}
              />
              <span className="italic text-slate-400">
                All sources (global)
              </span>
            </label>
            {sourceOptions.map((s) => (
              <label
                key={s.channelId}
                className="flex items-center gap-2 px-2 py-1 rounded text-sm text-slate-300 cursor-pointer hover:bg-slate-700/50"
              >
                <input
                  type="checkbox"
                  checked={ids.includes(s.channelId)}
                  onChange={() =>
                    onChange(
                      ids.includes(s.channelId)
                        ? ids.filter((id) => id !== s.channelId)
                        : [...ids, s.channelId],
                    )
                  }
                  disabled={disabled}
                />
                <span>{sourceLabel(s)}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function templateLabel(
  templateId: string | null,
  templates: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (templateId === null) return 'Default';
  const found = templates.find((t) => t.id === templateId);
  return found
    ? `Template: ${found.name}`
    : `Template: ${templateId.slice(0, 8)}…`;
}

export { SourceMultiSelect, sourceLabel, templateLabel, type SourceOption };
