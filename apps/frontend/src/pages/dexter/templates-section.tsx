import { useState } from 'react';
import {
  useActivateTemplate,
  useCreateTemplate,
  useDeleteTemplate,
  useDexterTemplates,
  useUpdateTemplate,
  type MessageTemplateView,
} from '@/entities/dexter';
import { Badge, Button, Card, Modal } from '@/shared/ui';
import { RenderMarkdownV2 } from '@/shared/lib/render-markdown-v2';
import {
  DEXTER_COMMANDS,
  spanishMutationError,
} from './dexter-template-helpers';

interface TemplatesSectionProps {
  readonly onPreview: (templateId: string) => void;
}

type ModalMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; template: MessageTemplateView };

function TemplateFormModal({
  mode,
  command,
  onClose,
}: {
  mode: Exclude<ModalMode, { kind: 'closed' }>;
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
      title={isCreate ? 'Crear plantilla' : 'Editar plantilla'}
      closeOnBackdropClick={!pending}
      closeOnEscape={!pending}
    >
      <div className="space-y-3">
        {isCreate && (
          <label className="block text-xs text-slate-400">
            Comando
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
          Nombre
          <input
            data-testid="dexter-template-form-name"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="block text-xs text-slate-400">
          Cuerpo (MarkdownV2)
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
            {spanishMutationError(mutation.error)}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            data-testid="dexter-template-form-submit"
            disabled={pending || name.trim() === '' || body.trim() === ''}
            onClick={submit}
          >
            {pending ? 'Guardando…' : 'Confirmar'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="dexter-template-form-cancel"
            disabled={pending}
            onClick={close}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
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
            <Badge tone="green">activa</Badge>
          </span>
        )}
        <Badge tone="gray">v{template.version}</Badge>
      </div>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Vista previa del cuerpo</summary>
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
          Vista previa
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
            Activar
          </Button>
        )}
        {confirm === 'activate' && (
          <span className="flex gap-2 items-center text-xs text-slate-400">
            Otra plantilla está activa — ¿cambiar?
            <Button
              size="sm"
              data-testid={`dexter-template-activate-confirm-${template.id}`}
              disabled={pending}
              onClick={doActivate}
            >
              Confirmar
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
              Cancelar
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
            Borrar
          </Button>
        )}
        {confirm === 'delete' && (
          <span className="flex gap-2 items-center text-xs text-slate-400">
            ¿Borrar esta plantilla?
            <Button
              size="sm"
              variant="danger"
              data-testid={`dexter-template-delete-confirm-${template.id}`}
              disabled={pending}
              onClick={doDelete}
            >
              Confirmar
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
              Cancelar
            </Button>
          </span>
        )}
      </div>
      {(activate.isError || remove.isError) && (
        <div
          data-testid={`dexter-template-row-error-${template.id}`}
          className="text-xs text-red-400"
        >
          {spanishMutationError(activate.error ?? remove.error)}
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
        Editar
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
        <h2 className="text-sm font-bold text-slate-100">Plantillas</h2>
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
          Crear
        </Button>
      </div>
      {templates.isPending && (
        <div
          data-testid="dexter-templates-loading"
          className="text-xs text-slate-500 mt-2"
        >
          Cargando…
        </div>
      )}
      {templates.isError && (
        <div
          data-testid="dexter-templates-empty"
          className="text-xs text-slate-500 mt-2"
        >
          Plantillas no disponibles — ¿está levantado el servicio dexter?
        </div>
      )}
      {templates.data && rows.length === 0 && (
        <div
          data-testid="dexter-templates-empty"
          className="text-xs text-slate-500 mt-2"
        >
          Sin plantillas
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
