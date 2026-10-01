import { useState } from 'react';
import type { TemplateCallRow } from '@/entities/template';
import { formatMc, timeAgo, trackingLabelFor } from '@/entities/template';
import { KolAvatar } from './kol-avatar';

interface CallsTableProps {
  readonly rows: ReadonlyArray<TemplateCallRow>;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

function CallCell({ row }: { row: TemplateCallRow }) {
  if (row.ticker) {
    return <span className="font-semibold text-slate-100">${row.ticker}</span>;
  }
  if (row.address) {
    return (
      <span className="font-mono text-xs text-slate-300" title={row.address}>
        {row.address.slice(0, 6)}…{row.address.slice(-4)}
      </span>
    );
  }
  return <span className="text-slate-500">—</span>;
}

export function CallsTable({ rows, isLoading, isError }: CallsTableProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  if (isLoading) {
    return (
      <div
        data-testid="calls-table-loading"
        className="rounded bg-slate-900 p-4 text-sm text-slate-400"
      >
        Cargando calls…
      </div>
    );
  }
  if (isError) {
    return (
      <div
        data-testid="calls-table-empty"
        className="rounded bg-slate-900 p-4 text-sm text-slate-400"
      >
        No calls available — API unreachable. Showing empty state.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        data-testid="calls-table-empty"
        className="rounded bg-slate-900 p-4 text-sm text-slate-400"
      >
        No calls for this template yet.
      </div>
    );
  }
  const toggle = (mentionId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(mentionId)) {
        next.delete(mentionId);
      } else {
        next.add(mentionId);
      }
      return next;
    });
  };
  return (
    <div
      data-testid="kol-calls-table"
      className="overflow-x-auto rounded bg-slate-900"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500">
            <th className="px-3 py-2">Caller</th>
            <th className="px-3 py-2">Call</th>
            <th className="px-3 py-2">MC at</th>
            <th className="px-3 py-2">Tracking</th>
            <th className="px-3 py-2">Time ago</th>
            <th className="px-3 py-2">More</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expanded.has(row.mentionId);
            return (
              <tr
                key={row.mentionId}
                data-testid={`call-row-${row.mentionId}`}
                className="border-t border-slate-800"
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <KolAvatar
                      channelId={row.kolId}
                      avatarUrl={row.avatarUrl}
                      handle={row.kolHandle}
                      size={28}
                    />
                    <span>
                      <span className="block text-slate-100">
                        {row.kolHandle ?? row.kolId}
                      </span>
                      {row.kolUrl ? (
                        <a
                          href={row.kolUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs text-blue-400"
                        >
                          {row.kolUrl.replace(/^https?:\/\//, '').slice(0, 32)}
                        </a>
                      ) : null}
                      <span
                        data-testid={`db-id-${row.mentionId}`}
                        className="block font-mono text-[10px] text-slate-500"
                      >
                        {row.mentionId}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <CallCell row={row} />
                  {row.chain ? (
                    <span className="ml-1 text-xs text-slate-500">
                      {row.chain}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-200">
                  {formatMc(row.mcAt)}
                </td>
                <td className="px-3 py-2">
                  <span
                    data-testid={`tracking-${row.mentionId}`}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-xs"
                  >
                    {trackingLabelFor(row)}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-400">
                  {timeAgo(row.scoredAt)}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    data-testid={`more-details-${row.mentionId}`}
                    className="text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => toggle(row.mentionId)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? 'less −' : 'more details+'}
                  </button>
                  {isOpen && (
                    <div
                      data-testid={`details-${row.mentionId}`}
                      className="mt-1 max-w-xs text-xs text-slate-400"
                    >
                      <p>score: {row.score ?? '—'}</p>
                      <p>address: {row.address ?? '—'}</p>
                      {row.breakdown.length > 0 ? (
                        <ul className="mt-1 list-disc pl-4">
                          {row.breakdown.map(
                            (b: {
                              factor: string;
                              delta: number;
                              note: string;
                            }) => (
                              <li key={b.factor}>
                                {b.factor}: {b.delta} — {b.note}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p>No enrichment breakdown.</p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
