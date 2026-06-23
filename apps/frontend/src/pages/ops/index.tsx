import { useState } from 'react';
import { ReplayForm } from '@/features/replay-message';
import { Card } from '@/shared/ui';

export function OpsPage() {
  const [tab, setTab] = useState<'replay'>('replay');

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">⚠️ Operator panel</h1>
      <p className="text-sm text-slate-400">
        Controles manuales. Usar con cuidado.
      </p>

      <div className="flex gap-2 text-sm">
        <button
          onClick={() => setTab('replay')}
          className={`px-3 py-1.5 rounded ${
            tab === 'replay'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          Replay message
        </button>
      </div>

      <Card>{tab === 'replay' && <ReplayForm />}</Card>
    </div>
  );
}
