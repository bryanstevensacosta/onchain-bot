import type { KolSourceOption } from '@/entities/template';

interface SourceMultiSelectProps {
  readonly sources: ReadonlyArray<KolSourceOption>;
  readonly selected: ReadonlyArray<string>;
  readonly onChange: (ids: ReadonlyArray<string>) => void;
  readonly isPending?: boolean;
}

export function SourceMultiSelect({
  sources,
  selected,
  onChange,
  isPending,
}: SourceMultiSelectProps) {
  const selectedSet = new Set(selected);
  const toggle = (channelId: string) => {
    if (selectedSet.has(channelId)) {
      onChange(selected.filter((id) => id !== channelId));
    } else {
      onChange([...selected, channelId]);
    }
  };
  return (
    <div
      data-testid="template-sources-filter"
      className="rounded bg-slate-900 p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-200">KOL sources</h3>
        {selected.length > 0 && (
          <button
            type="button"
            data-testid="sources-clear"
            className="text-xs text-blue-400 hover:text-blue-300"
            onClick={() => onChange([])}
          >
            Clear (all)
          </button>
        )}
      </div>
      {sources.length === 0 ? (
        <p data-testid="sources-empty" className="text-sm text-slate-500">
          No KOL sources available
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sources.map((source) => {
            const checked = selectedSet.has(source.channelId);
            return (
              <label
                key={source.channelId}
                data-testid={`source-option-${source.channelId}`}
                className={`cursor-pointer rounded border px-2 py-1 text-xs ${
                  checked
                    ? 'border-blue-500 bg-blue-950 text-blue-200'
                    : 'border-slate-700 text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={checked}
                  disabled={isPending}
                  onChange={() => toggle(source.channelId)}
                />
                {source.handle ?? source.title}
              </label>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {selected.length === 0
          ? 'Showing all sources'
          : `${selected.length} source(s) selected`}
      </p>
    </div>
  );
}
