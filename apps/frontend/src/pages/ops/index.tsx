import { useState } from 'react';
import { ReplayForm } from '@/features/replay-message';
import { FiltersTab } from '@/features/settings/ui/filters-tab';
import { PresetsTab } from '@/features/settings/ui/presets-tab';
import { Card } from '@/shared/ui';

type OpsTab = 'replay' | 'filters' | 'presets';

const TABS: ReadonlyArray<{ id: OpsTab; label: string }> = [
  { id: 'replay', label: 'Replay message' },
  { id: 'filters', label: 'Filters' },
  { id: 'presets', label: 'Presets' },
];

export function OpsPage() {
  const [tab, setTab] = useState<OpsTab>('replay');

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Operator panel</h1>
      <p className="text-sm text-slate-400">
        Controles manuales. Usar con cuidado.
      </p>

      <div className="flex gap-2 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded ${
              tab === t.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'replay' && (
        <Card>
          <ReplayForm />
        </Card>
      )}
      {tab === 'filters' && <FiltersTab />}
      {tab === 'presets' && <PresetsTab />}
    </div>
  );
}
