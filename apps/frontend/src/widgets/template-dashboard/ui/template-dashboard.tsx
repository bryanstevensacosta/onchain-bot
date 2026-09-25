import { useMemo, useState } from 'react';
import {
  filterCallsBySources,
  useKolRankings,
  useKolSources,
  useTemplateCalls,
  useTemplateDetail,
  useTemplates,
  useUpdateTemplateSources,
  type RankingWindow,
} from '@/entities/template';
import { CallsTable } from './calls-table';
import { PerformanceRanking } from './performance-ranking';
import { SourceMultiSelect } from './source-multi-select';
import { TemplateConfigSection } from './template-config-section';
import { TopCallersStrip } from './top-callers-strip';

export function TemplateDashboard() {
  const templatesQuery = useTemplates();
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const activeTemplateId = templateId ?? templatesQuery.data?.[0]?.id;
  const detailQuery = useTemplateDetail(activeTemplateId);
  const callsQuery = useTemplateCalls(activeTemplateId);
  const sourcesQuery = useKolSources();
  const [window, setWindow] = useState<RankingWindow>('30d');
  const [perfSort] = useState<'perf_desc' | 'perf_asc'>('perf_desc');
  const perfQuery = useKolRankings(window, perfSort);
  const countQuery = useKolRankings(window, 'calls_desc');
  const updateSources = useUpdateTemplateSources(activeTemplateId ?? '');
  const [localSelection, setLocalSelection] = useState<
    ReadonlyArray<string> | undefined
  >(undefined);

  const template = detailQuery.data;
  const selection = useMemo(
    () => localSelection ?? template?.kolSourceIds ?? [],
    [localSelection, template],
  );
  const enrichedCalls = useMemo(() => {
    const calls = callsQuery.data ?? [];
    const sourceById = new Map(
      (sourcesQuery.data ?? []).map((s) => [s.channelId, s]),
    );
    const joined = calls.map((call) => {
      const source = sourceById.get(call.kolId);
      return {
        ...call,
        kolHandle: call.kolHandle ?? source?.handle ?? null,
        kolTitle: call.kolTitle ?? source?.title ?? null,
        kolUrl: call.kolUrl ?? source?.url ?? null,
        avatarUrl: call.avatarUrl ?? source?.avatarUrl ?? null,
      };
    });
    return filterCallsBySources(joined, selection);
  }, [callsQuery.data, sourcesQuery.data, selection]);

  const handleSelectionChange = (ids: ReadonlyArray<string>) => {
    setLocalSelection(ids);
    if (activeTemplateId) {
      updateSources.mutate(ids);
    }
  };

  if (templatesQuery.isLoading) {
    return (
      <div
        data-testid="template-dashboard-loading"
        className="space-y-6 p-6 text-sm text-slate-400"
      >
        Cargando templates…
      </div>
    );
  }
  if (templatesQuery.isError || (templatesQuery.data ?? []).length === 0) {
    return (
      <div
        data-testid="template-dashboard-empty"
        className="space-y-6 p-6 text-sm text-slate-400"
      >
        No templates available — API unreachable. Showing empty state.
      </div>
    );
  }
  return (
    <div data-testid="template-dashboard" className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Template dashboard</h1>
        <label className="text-xs text-slate-400">
          Template{' '}
          <select
            data-testid="template-picker"
            value={activeTemplateId ?? ''}
            onChange={(e) => {
              setTemplateId(e.target.value || undefined);
              setLocalSelection(undefined);
            }}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          >
            {(templatesQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SourceMultiSelect
        sources={sourcesQuery.data ?? []}
        selected={[...selection]}
        onChange={handleSelectionChange}
        isPending={updateSources.isPending}
      />
      <CallsTable
        rows={enrichedCalls}
        isLoading={callsQuery.isLoading}
        isError={callsQuery.isError}
      />
      <PerformanceRanking
        rows={perfQuery.data ?? []}
        isLoading={perfQuery.isLoading}
        isError={perfQuery.isError}
      />
      <TopCallersStrip
        rows={countQuery.data ?? []}
        window={window}
        onWindowChange={setWindow}
        isLoading={countQuery.isLoading}
        isError={countQuery.isError}
      />
      <TemplateConfigSection
        template={template}
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
      />
    </div>
  );
}
