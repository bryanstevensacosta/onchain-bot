import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllFilters,
  updateFilter,
  settingsFilterKeys,
  type SettingsFilter,
} from 'features/settings/api/settings-api';
import { Button, Card } from '@/shared/ui';

export function FiltersTab(): React.ReactElement {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: settingsFilterKeys.list(),
    queryFn: fetchAllFilters,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateFilter>[1] }) =>
      updateFilter(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsFilterKeys.all }),
  });

  const [edits, setEdits] = useState<Record<string, Partial<SettingsFilter>>>({});

  if (isLoading) return <Card className="text-xs text-slate-500">Loading filters…</Card>;

  const filters = data ?? [];

  const grouped = filters.reduce<Record<string, SettingsFilter[]>>((acc, f) => {
    (acc[f.type] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([type, rows]) => (
        <Card key={type}>
          <h3 className="text-sm font-bold text-slate-200 uppercase mb-2">{type}</h3>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700">
                <th className="py-1 pr-2">Value</th>
                <th className="py-1 pr-2">Numeric</th>
                <th className="py-1 pr-2">Enabled</th>
                <th className="py-1 pr-2">Scope</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const dirty = edits[f.id];
                const currentNumeric = dirty?.numericValue ?? f.numericValue;
                const currentEnabled = dirty?.enabled ?? f.enabled;
                const hasChanges = dirty !== undefined;
                return (
                  <tr key={f.id} className="border-b border-slate-800/50">
                    <td className="py-1.5 pr-2 font-mono text-slate-300">{f.value}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        step="any"
                        value={currentNumeric ?? ''}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [f.id]: {
                              ...prev[f.id],
                              numericValue:
                                e.target.value === '' ? null : Number(e.target.value),
                            },
                          }))
                        }
                        className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 w-20 text-slate-100"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={currentEnabled}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [f.id]: {
                              ...prev[f.id],
                              enabled: e.target.checked,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-slate-500">{f.scope}</td>
                    <td className="py-1.5">
                      {hasChanges && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            updateMut.mutate({
                              id: f.id,
                              body: {
                                numericValue: dirty!.numericValue,
                                enabled: dirty!.enabled,
                              },
                            });
                            setEdits((prev) => {
                              const copy = { ...prev };
                              delete copy[f.id];
                              return copy;
                            });
                          }}
                          disabled={updateMut.isPending}
                        >
                          Save
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}