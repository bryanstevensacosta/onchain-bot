import { useState } from 'react';
import {
  useCreateTemplate,
  useUpdateTemplate,
  type MessageTemplateView,
} from '@/entities/dexter';
import { Button, Modal } from '@/shared/ui';
import {
  DEXTER_COMMANDS,
  englishMutationError,
} from './dexter-template-helpers';

export type TemplateFormModalMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; template: MessageTemplateView };

/**
 * Shared create/edit modal for dexter message templates (single CRUD
 * implementation — `TemplatesSection` and the live-editor save flow
 * both reuse these hooks, never a second mutation).
 */
export function TemplateFormModal({
  mode,
  command,
  onClose,
}: {
  mode: Exclude<TemplateFormModalMode, { kind: 'closed' }>;
  command: string;
  onClose: () => void;
}) {
  const isCreate = mode.kind === 'create';
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const mutation = isCreate ? create : update;
  const pending = mutation.isPending;

  const [name, setName] = useState(
    mode.kind === 'edit' ? mode.template.name : '',
  );
  const [modalCommand, setModalCommand] = useState(command);
  const [body, setBody] = useState(
    mode.kind === 'edit' ? mode.template.bodyMarkdown : '',
  );

  const close = () => {
    if (pending) return;
    mutation.reset();
    onClose();
  };

  const submit = () => {
    if (isCreate) {
      create.mutate(
        { command: modalCommand, name, bodyMarkdown: body },
        { onSuccess: close },
      );
    } else if (mode.kind === 'edit') {
      update.mutate(
        { id: mode.template.id, body: { name, bodyMarkdown: body } },
        { onSuccess: close },
      );
    }
  };

  return (
    <Modal
      isOpen
      onClose={close}
      title={isCreate ? 'Create template' : 'Edit template'}
      closeOnBackdropClick={!pending}
      closeOnEscape={!pending}
    >
      <div className="space-y-3">
        {isCreate && (
          <label className="block text-xs text-slate-400">
            Command
            <select
              data-testid="dexter-template-form-command"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
              value={modalCommand}
              onChange={(e) => setModalCommand(e.target.value)}
              disabled={pending}
            >
              {DEXTER_COMMANDS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs text-slate-400">
          Name
          <input
            data-testid="dexter-template-form-name"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="block text-xs text-slate-400">
          Body (MarkdownV2)
          <textarea
            data-testid="dexter-template-form-body"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={pending}
          />
        </label>
        {mutation.isError && (
          <div
            data-testid="dexter-template-form-error"
            className="text-xs text-red-400"
          >
            {englishMutationError(mutation.error)}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            data-testid="dexter-template-form-submit"
            disabled={pending || name.trim() === '' || body.trim() === ''}
            onClick={submit}
          >
            {pending ? 'Saving…' : 'Confirm'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="dexter-template-form-cancel"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
