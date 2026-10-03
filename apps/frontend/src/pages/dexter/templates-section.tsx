import { useState } from 'react';
import {
  useActivateTemplate,
  useDeleteTemplate,
  useDexterTemplates,
  type MessageTemplateView,
} from '@/entities/dexter';
import { Badge, Button, Card } from '@/shared/ui';
import { RenderMarkdownV2 } from '@/shared/lib/render-markdown-v2';
import {
  DEXTER_COMMANDS,
  englishMutationError,
} from './dexter-template-helpers';
import { TemplateFormModal } from './template-form-modal';

interface TemplatesSectionProps {
  readonly onPreview: (templateId: string) => void;
}

function TemplateRow({
  template,
  hasOtherActive,
  onPreview,
}: {
  template: MessageTemplateView;
  hasOtherActive: boolean;
  onPreview: (templateId: string) => void;
}) {
  const activate = useActivateTemplate();
  const remove = useDeleteTemplate();
  const [confirm, setConfirm] = useState<'activate' | 'delete' | null>(null);
  const pending = activate.isPending || remove.isPending;

  const needsActivateConfirm = !template.isActive && hasOtherActive;

  const doActivate = () => {
    activate.mutate(template.id, {
      onSuccess: () => setConfirm(null),
    });
  };
  const doDelete = () => {
    remove.mutate(template.id, {
      onSuccess: () => setConfirm(null),
    });
  };

  return (
    <li
      data-testid={`dexter-template-row-${template.id}`}
      className="border border-slate-800 rounded p-2 space-y-1"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-slate-200">{template.name}</span>
        {template.isActive && (
          <span data-testid={`dexter-template-active-${template.id}`}>
            <Badge tone="green">active</Badge>
          </span>
        )}
      </div>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Body preview</summary>
        <div
          data-testid={`dexter-template-body-${template.id}`}
          className="mt-1 max-h-32 overflow-y-auto bg-slate-950 border border-slate-800 rounded p-2 text-slate-300"
        >
          <RenderMarkdownV2 body={template.bodyMarkdown} />
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onPreview(template.id)}
        >
          Preview
        </Button>
        {!template.isActive && confirm !== 'activate' && (
          <Button
            size="sm"
            data-testid={`dexter-template-activate-${template.id}`}
            disabled={pending}
            onClick={() =>
              needsActivateConfirm ? setConfirm('activate') : doActivate()
            }
          >
            Activate
          </Button>
        )}
        {confirm === 'activate' && (
          <span className="flex gap-2 items-center text-xs text-slate-400">
            Another template is active — switch?
            <Button
              size="sm"
              data-testid={`dexter-template-activate-confirm-${template.id}`}
              disabled={pending}
              onClick={doActivate}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                activate.reset();
                setConfirm(null);
              }}
            >
              Cancel
            </Button>
          </span>
        )}
        <TemplateEditButton template={template} />
        {confirm !== 'delete' && (
          <Button
            size="sm"
            variant="danger"
            data-testid={`dexter-template-delete-${template.id}`}
            disabled={pending}
            onClick={() => setConfirm('delete')}
          >
            Delete
          </Button>
        )}
        {confirm === 'delete' && (
          <span className="flex gap-2 items-center text-xs text-slate-400">
            Delete this template?
            <Button
              size="sm"
              variant="danger"
              data-testid={`dexter-template-delete-confirm-${template.id}`}
              disabled={pending}
              onClick={doDelete}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                remove.reset();
                setConfirm(null);
              }}
            >
              Cancel
            </Button>
          </span>
        )}
      </div>
      {(activate.isError || remove.isError) && (
        <div
          data-testid={`dexter-template-row-error-${template.id}`}
          className="text-xs text-red-400"
        >
          {englishMutationError(activate.error ?? remove.error)}
        </div>
      )}
    </li>
  );
}

function TemplateEditButton({ template }: { template: MessageTemplateView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        data-testid={`dexter-template-edit-${template.id}`}
        onClick={() => setOpen(true)}
      >
        Edit
      </Button>
      {open && (
        <TemplateFormModal
          mode={{ kind: 'edit', template }}
          command={template.command}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function TemplatesSection({ onPreview }: TemplatesSectionProps) {
  const [command, setCommand] = useState<string>('ca');
  const [modalOpen, setModalOpen] = useState(false);
  const templates = useDexterTemplates(command);

  const rows = Array.isArray(templates.data) ? templates.data : [];
  const activeCount = rows.filter((t) => t.isActive).length;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-100">Templates</h2>
        <select
          data-testid="dexter-template-command"
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
        <Button
          size="sm"
          data-testid="dexter-template-create"
          onClick={() => setModalOpen(true)}
        >
          Create
        </Button>
      </div>
      {templates.isPending && (
        <div
          data-testid="dexter-templates-loading"
          className="text-xs text-slate-500 mt-2"
        >
          Loading…
        </div>
      )}
      {templates.isError && (
        <div
          data-testid="dexter-templates-empty"
          className="text-xs text-slate-500 mt-2"
        >
          Templates unavailable — is the dexter service up?
        </div>
      )}
      {templates.data && rows.length === 0 && (
        <div
          data-testid="dexter-templates-empty"
          className="text-xs text-slate-500 mt-2"
        >
          No templates
        </div>
      )}
      {templates.data && rows.length > 0 && (
        <ul
          data-testid="dexter-templates-list"
          className="mt-2 space-y-2 text-sm"
        >
          {rows.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              hasOtherActive={activeCount > 0 && !t.isActive}
              onPreview={onPreview}
            />
          ))}
        </ul>
      )}
      {modalOpen && (
        <TemplateFormModal
          mode={{ kind: 'create' }}
          command={command}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Card>
  );
}
