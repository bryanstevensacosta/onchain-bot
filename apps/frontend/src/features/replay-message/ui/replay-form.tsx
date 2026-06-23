import { useState } from 'react';
import { Button } from '@/shared/ui';
import { useMutation } from '@tanstack/react-query';
import { replayMessage, type ExtractionResultView } from '../api/replay-client';

export function ReplayForm() {
  const [kolId, setKolId] = useState('');
  const [messageId, setMessageId] = useState('1');
  const [text, setText] = useState('');
  const mutation = useMutation<ExtractionResultView, Error>({
    mutationFn: () =>
      replayMessage({
        kolId,
        messageId: parseInt(messageId, 10),
        occurredAt: new Date().toISOString(),
        text,
      }),
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">KOL ID</label>
        <input
          value={kolId}
          onChange={(e) => setKolId(e.target.value)}
          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm"
          placeholder="e.g. 1924457034"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Message ID</label>
        <input
          value={messageId}
          onChange={(e) => setMessageId(e.target.value)}
          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm"
          type="number"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm font-mono"
          placeholder="$PEPE 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 to the moon"
        />
      </div>
      <Button
        onClick={() => mutation.mutate()}
        disabled={!kolId || !text || mutation.isPending}
      >
        {mutation.isPending ? '⏳ replaying…' : '▶ Run pipeline'}
      </Button>
      {mutation.isSuccess && (
        <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-2 overflow-x-auto">
          {JSON.stringify(mutation.data, null, 2)}
        </pre>
      )}
      {mutation.isError && (
        <div className="text-xs text-red-400">✗ {mutation.error.message}</div>
      )}
    </div>
  );
}
