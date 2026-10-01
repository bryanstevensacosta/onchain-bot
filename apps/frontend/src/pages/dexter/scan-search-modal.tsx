import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/shared/ui';
import { ScanResultView, type ParsedScan } from './scan-views';

interface ScanSearchModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly scan: ParsedScan | null;
  readonly parseError: boolean;
  readonly recent: ReadonlyArray<string>;
  readonly onSubmit: (raw: string) => void;
  readonly onSelectRecent: (query: string) => void;
  readonly onClearRecent: () => void;
}

export function ScanSearchModal({
  isOpen,
  onClose,
  scan,
  parseError,
  recent,
  onSubmit,
  onSelectRecent,
  onClearRecent,
}: ScanSearchModalProps) {
  const [draft, setDraft] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocus.current = document.activeElement;
    setDraft('');
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = prevOverflow;
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const focusables = (): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]',
      ),
    ).filter((el) => el.tabIndex !== -1);
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      data-testid="scan-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        data-testid="scan-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Scanner search"
        className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
        onKeyDown={handlePanelKeyDown}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            Scanner search
          </h2>
          <button
            data-testid="scan-modal-close"
            onClick={onClose}
            aria-label="Close scanner search"
            className="cursor-pointer border-none bg-transparent p-0 text-xl leading-none text-slate-400 hover:text-slate-200"
          >
            ×
          </button>
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(draft);
          }}
        >
          <input
            ref={inputRef}
            data-testid="scan-modal-input"
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-sm text-slate-100"
            placeholder="/x solana <address> · /c ethereum <address> · or paste a bare address"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" size="sm" data-testid="scan-modal-submit">
            Scan
          </Button>
        </form>
        <div data-testid="scan-modal-recent" className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase text-slate-500">
              Recent searches
            </h3>
            {recent.length > 0 && (
              <button
                data-testid="scan-modal-clear-recent"
                onClick={onClearRecent}
                className="cursor-pointer border-none bg-transparent p-0 text-xs text-slate-400 underline hover:text-slate-200"
              >
                Clear all
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <div
              data-testid="scan-modal-recent-empty"
              className="mt-2 text-xs text-slate-500"
            >
              No recent searches yet.
            </div>
          ) : (
            <ul className="mt-2 space-y-1">
              {recent.map((query) => (
                <li key={query}>
                  <button
                    data-testid="scan-modal-recent-item"
                    onClick={() => {
                      setDraft(query);
                      onSelectRecent(query);
                    }}
                    className="w-full cursor-pointer truncate rounded border border-slate-800 bg-slate-950 px-2 py-1 text-left font-mono text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
                  >
                    {query}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid="scan-modal-results" className="mt-4">
          {parseError && (
            <div
              data-testid="scan-modal-parse-error"
              className="mt-2 text-sm text-red-400"
            >
              Usage: /x &lt;chain&gt; &lt;address&gt; or /c &lt;chain&gt;
              &lt;address&gt; — or paste a bare contract address (0x… for EVM,
              base58 for Solana).
            </div>
          )}
          {scan && <ScanResultView scan={scan} />}
          {!scan && !parseError && (
            <div
              data-testid="scan-modal-idle"
              className="mt-2 text-sm text-slate-500"
            >
              Type a scan above — results appear here.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
