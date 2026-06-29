import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllPresets,
  createPreset,
  applyPreset,
  deletePreset,
  settingsPresetKeys,
} from '@/features/settings/api/settings-api';
import { Button, Card } from '@/shared/ui';

export function PresetsTab(): React.ReactElement {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: settingsPresetKeys.list(),
    queryFn: fetchAllPresets,
  });

  const createMut = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      createPreset({
        name: body.name,
        description: body.description,
        snapshot: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsPresetKeys.all }),
  });
  const applyMut = useMutation({
    mutationFn: (id: string) => applyPreset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsPresetKeys.all }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePreset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsPresetKeys.all }),
  });

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  if (isLoading)
    return <Card className="text-xs text-slate-500">Loading presets…</Card>;

  const presets = data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-bold text-slate-200 uppercase mb-2">
          Create new preset
        </h3>
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
              placeholder="my-preset"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">
              Description
            </label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
              placeholder="optional"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => {
              createMut.mutate({
                name: name.trim(),
                description: desc.trim() || undefined,
              });
              setName('');
              setDesc('');
            }}
          >
            {createMut.isPending ? '…' : 'Create'}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-slate-200 uppercase mb-2">
          Presets
        </h3>
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700">
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Active</th>
              <th className="py-1 pr-2">Created</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {presets.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-4 text-center text-slate-600 italic"
                >
                  No presets yet
                </td>
              </tr>
            )}
            {presets.map((p) => (
              <tr key={p.id} className="border-b border-slate-800/50">
                <td className="py-1.5 pr-2 font-mono text-slate-300">
                  {p.name}
                </td>
                <td className="py-1.5 pr-2">
                  {p.isActive ? (
                    <span className="text-green-400">active</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
                <td className="py-1.5 flex gap-1">
                  {!p.isActive && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={applyMut.isPending}
                      onClick={() => applyMut.mutate(p.id)}
                    >
                      Apply
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(p.id)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
