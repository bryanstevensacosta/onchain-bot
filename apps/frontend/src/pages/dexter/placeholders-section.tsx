import { useState } from 'react';
import { usePlaceholders } from '@/entities/dexter';
import { Badge, Card } from '@/shared/ui';
import { DEXTER_COMMANDS } from './dexter-template-helpers';

export function PlaceholdersSection() {
  const [command, setCommand] = useState<string>('ca');
  const placeholders = usePlaceholders(command);
  const rows = Array.isArray(placeholders.data?.placeholders)
    ? placeholders.data.placeholders
    : [];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-100">Placeholders</h2>
        <select
          data-testid="dexter-placeholders-command"
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        >
          {DEXTER_COMMANDS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {placeholders.isPending && (
        <div
          data-testid="dexter-placeholders-loading"
          className="text-xs text-slate-500 mt-2"
        >
          Loading…
        </div>
      )}
      {placeholders.isError && (
        <div
          data-testid="dexter-placeholders-empty"
          className="text-xs text-slate-500 mt-2"
        >
          Placeholders unavailable — is the dexter service up?
        </div>
      )}
      {placeholders.data && rows.length === 0 && (
        <div
          data-testid="dexter-placeholders-empty"
          className="text-xs text-slate-500 mt-2"
        >
          No placeholders
        </div>
      )}
      {placeholders.data && rows.length > 0 && (
        <table
          data-testid="dexter-placeholders-table"
          className="mt-2 w-full text-xs"
        >
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-2">Key</th>
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Nullable</th>
              <th className="py-1">Example</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.key}
                data-testid={`dexter-placeholder-row-${p.key}`}
                className="border-t border-slate-800 font-mono"
              >
                <td className="py-1 pr-2 text-slate-200">{p.key}</td>
                <td className="py-1 pr-2 text-slate-400">{p.type}</td>
                <td className="py-1 pr-2">
                  <Badge tone={p.nullable ? 'yellow' : 'gray'}>
                    {p.nullable ? 'Yes' : 'No'}
                  </Badge>
                </td>
                <td className="py-1 text-slate-400">
                  {p.example === '' ? '—' : p.example}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
