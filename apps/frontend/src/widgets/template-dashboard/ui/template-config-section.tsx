import type { TemplateView } from '@/entities/template';

interface TemplateConfigSectionProps {
  readonly template: TemplateView | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

export function TemplateConfigSection({
  template,
  isLoading,
  isError,
}: TemplateConfigSectionProps) {
  if (isLoading) {
    return (
      <div
        data-testid="template-config-loading"
        className="rounded bg-slate-900 p-4 text-sm text-slate-400"
      >
        Cargando template config…
      </div>
    );
  }
  if (isError || !template) {
    return (
      <div
        data-testid="template-config-empty"
        className="rounded bg-slate-900 p-4 text-sm text-slate-400"
      >
        No template config — API unreachable. Showing empty state.
      </div>
    );
  }
  return (
    <section
      data-testid="template-config"
      aria-label="Template configuration"
      className="rounded bg-slate-900 p-4"
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-200">
        Template config — {template.name}
      </h3>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Sources</dt>
          <dd data-testid="config-sources" className="text-slate-200">
            {template.kolSourceIds.length === 0
              ? 'All sources'
              : `${template.kolSourceIds.length} selected`}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Score display floor</dt>
          <dd data-testid="config-min-score" className="text-slate-200">
            {template.minVisibleScore}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Gem filters</dt>
          <dd data-testid="config-gems" className="text-slate-200">
            ≥{template.gemMinScore} · {template.gemPatterns.length} pattern(s)
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Bot</dt>
          <dd data-testid="config-bot" className="text-slate-200">
            {template.botId ?? 'dashboard-only'} →{' '}
            {template.channelTarget ?? '—'}
            {template.canPublish ? ' (verified)' : ''}
          </dd>
        </div>
      </dl>
      {template.gemPatterns.length > 0 && (
        <ul
          data-testid="config-gem-patterns"
          className="mt-2 list-disc pl-5 text-xs text-slate-400"
        >
          {template.gemPatterns.map((pattern: string) => (
            <li key={pattern} className="font-mono">
              {pattern}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
