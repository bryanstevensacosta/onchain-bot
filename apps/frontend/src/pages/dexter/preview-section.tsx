import { useEffect, useState } from 'react';
import {
  isPreviewUnresolved,
  useDexterTemplate,
  useDexterTemplates,
  usePreviewTemplate,
} from '@/entities/dexter';
import { Badge, Button, Card } from '@/shared/ui';
import { RenderMarkdownV2 } from '@/shared/lib/render-markdown-v2';
import {
  DEXTER_COMMANDS,
  DEXTER_TIMEFRAMES,
  TIMEFRAME_COMMANDS,
  englishMutationError,
} from './dexter-template-helpers';

type PreviewMode = 'active' | 'id' | 'draft';

export function PreviewSection({
  seedTemplateId,
}: {
  readonly seedTemplateId: string | null;
}) {
  const [mode, setMode] = useState<PreviewMode>('active');
  const [command, setCommand] = useState<string>('ca');
  const [templateId, setTemplateId] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [address, setAddress] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [copied, setCopied] = useState(false);

  // The TemplatesSection "Preview" button seeds a by-id preview.
  useEffect(() => {
    if (seedTemplateId !== null) {
      setMode('id');
      setTemplateId(seedTemplateId);
    }
  }, [seedTemplateId]);

  const activeList = useDexterTemplates(command);
  const detail = useDexterTemplate(mode === 'id' ? templateId.trim() : '');

  const effectiveCommand =
    mode === 'active'
      ? command
      : mode === 'draft'
        ? command
        : (detail.data?.command ?? '');
  const timeframeEnabled = TIMEFRAME_COMMANDS.includes(effectiveCommand);

  const preview = usePreviewTemplate();
  const activeTemplate = (
    Array.isArray(activeList.data) ? activeList.data : []
  ).find((t) => t.isActive);

  const canSubmit =
    address.trim() !== '' &&
    !preview.isPending &&
    (mode === 'active'
      ? activeTemplate !== undefined
      : mode === 'id'
        ? templateId.trim() !== ''
        : draftBody.trim() !== '');

  const submit = () => {
    setCopied(false);
    if (mode === 'active') {
      if (!activeTemplate) return;
      preview.mutate({
        templateId: activeTemplate.id,
        address: address.trim(),
        ...(timeframeEnabled && timeframe.trim() !== ''
          ? { timeframe: timeframe.trim() }
          : {}),
      });
      return;
    }
    if (mode === 'id') {
      preview.mutate({
        templateId: templateId.trim(),
        address: address.trim(),
        ...(timeframeEnabled && timeframe.trim() !== ''
          ? { timeframe: timeframe.trim() }
          : {}),
      });
      return;
    }
    preview.mutate({
      draft: { command, bodyMarkdown: draftBody },
      address: address.trim(),
      ...(timeframeEnabled && timeframe.trim() !== ''
        ? { timeframe: timeframe.trim() }
        : {}),
    });
  };

  const copyResult = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const result = preview.data;
  const unresolved = result !== undefined && isPreviewUnresolved(result);

  return (
    <Card>
      <h2 className="text-sm font-bold text-slate-100">Preview</h2>
      <div className="flex flex-wrap gap-2 mt-2" role="radiogroup">
        <Button
          size="sm"
          variant={mode === 'active' ? 'primary' : 'secondary'}
          data-testid="dexter-preview-mode-active"
          onClick={() => setMode('active')}
        >
          Active by command
        </Button>
        <Button
          size="sm"
          variant={mode === 'id' ? 'primary' : 'secondary'}
          data-testid="dexter-preview-mode-id"
          onClick={() => setMode('id')}
        >
          By id
        </Button>
        <Button
          size="sm"
          variant={mode === 'draft' ? 'primary' : 'secondary'}
          data-testid="dexter-preview-mode-draft"
          onClick={() => setMode('draft')}
        >
          Free draft
        </Button>
      </div>

      <div className="grid gap-2 mt-2">
        {(mode === 'active' || mode === 'draft') && (
          <label className="block text-xs text-slate-400">
            Command
            <select
              data-testid="dexter-preview-command"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            >
              {DEXTER_COMMANDS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === 'id' && (
          <label className="block text-xs text-slate-400">
            Template id
            <input
              data-testid="dexter-preview-template-id"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            />
          </label>
        )}
        {mode === 'draft' && (
          <label className="block text-xs text-slate-400">
            Draft (MarkdownV2)
            <textarea
              data-testid="dexter-preview-draft"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
              rows={5}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
            />
          </label>
        )}
        <label className="block text-xs text-slate-400">
          Address
          <input
            data-testid="dexter-preview-address"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
            placeholder="So1111… o 0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="block text-xs text-slate-400">
          Timeframe (c/cc only)
          <input
            data-testid="dexter-preview-timeframe"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100 disabled:opacity-50"
            placeholder={DEXTER_TIMEFRAMES.join(' ')}
            value={timeframe}
            disabled={!timeframeEnabled}
            onChange={(e) => setTimeframe(e.target.value)}
          />
          <span className="text-slate-500">
            Valid: {DEXTER_TIMEFRAMES.join(', ')} (c/cc only)
          </span>
        </label>
        <div>
          <Button
            size="sm"
            data-testid="dexter-preview-submit"
            disabled={!canSubmit}
            onClick={submit}
          >
            {preview.isPending ? 'Generating…' : 'Generate preview'}
          </Button>
        </div>
      </div>

      {mode === 'active' &&
        activeList.data !== undefined &&
        activeTemplate === undefined && (
          <div
            data-testid="dexter-preview-no-active"
            className="text-xs text-slate-500 mt-2"
          >
            No active template for this command
          </div>
        )}

      {preview.isError && (
        <div
          data-testid="dexter-preview-error"
          className="text-xs text-red-400 mt-2"
        >
          {englishMutationError(preview.error)}
        </div>
      )}

      {result !== undefined && !unresolved && (
        <div data-testid="dexter-preview-result" className="mt-2 space-y-2">
          <div className="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200">
            <RenderMarkdownV2 body={result.text} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {result.truncated && <Badge tone="yellow">truncated</Badge>}
            {result.placeholdersUsed.map((key) => (
              <Badge key={key} tone="blue">
                {key}
              </Badge>
            ))}
            <Button
              size="sm"
              variant="secondary"
              data-testid="dexter-preview-copy"
              onClick={() => void copyResult(result.text)}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {result !== undefined && unresolved && (
        <div
          data-testid="dexter-preview-unresolved"
          className="text-xs text-amber-300 mt-2 space-y-1"
        >
          <div>
            No resolution for {result.address}: {result.error}
          </div>
          {(result.candidates ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(result.candidates ?? []).map((c) => (
                <Badge key={c} tone="amber">
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
