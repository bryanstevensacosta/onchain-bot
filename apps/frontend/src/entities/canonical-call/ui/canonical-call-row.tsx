import { useState } from 'react';
import type { CanonicalTokenCallView } from '../model/types';
import { Badge, Card, ChainIcon, TokenImage } from '@/shared/ui';
import { formatPercent, formatRelativeTime } from '@/shared/lib';
import { Link } from 'react-router-dom';

interface CanonicalCallRowProps {
  call: CanonicalTokenCallView;
}

export function CanonicalCallRow({ call }: CanonicalCallRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(call.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const displayName = call.name ?? call.ticker ?? null;

  return (
    <Link to={`/tokens/${call.chain}/${call.address}`}>
      <Card className="hover:border-slate-600 transition-colors cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <TokenImage
              chain={call.chain}
              address={call.address}
              name={call.name}
              ticker={call.ticker}
              size="sm"
            />
            <Badge tone="white" className="shrink-0">
              <ChainIcon chain={call.chain} className="mr-1" />
              {call.chain === 'solana' ? 'Solana' : 'EVM'}
            </Badge>
            <span
              className="font-mono text-sm text-slate-300 cursor-copy"
              onClick={handleCopyAddress}
              title="Copiar dirección"
            >
              {call.address.slice(0, 6)}…{call.address.slice(-4)}
              {copied && (
                <span className="ml-1 text-xs text-green-400">copiado</span>
              )}
            </span>
            {displayName && (
              <span className="text-slate-100 font-medium truncate">
                {displayName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0">
            <span>mentions: {call.mentionCount}</span>
            <span>conf: {formatPercent(call.confidence)}</span>
            <span>{formatRelativeTime(call.lastSeenAt)}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
