import { useState, type FormEvent } from 'react';
import { Button, Modal } from '@/shared/ui';
import { useAddKol } from '../model/use-add-kol';

interface AddKolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddKolModal({ isOpen, onClose }: AddKolModalProps) {
  const [kolId, setKolId] = useState('');
  const mutation = useAddKol();

  const trimmed = kolId.trim();
  const canSubmit = trimmed.length > 0 && !mutation.isPending;

  function handleClose() {
    if (mutation.isPending) return;
    setKolId('');
    mutation.reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await mutation.mutateAsync(trimmed);
      setKolId('');
      onClose();
    } catch {
      // error surfaced via mutation.error
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add KOL" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="add-kol-kolId"
            className="block text-xs uppercase text-slate-400 mb-1"
          >
            Telegram ID
          </label>
          <input
            id="add-kol-kolId"
            type="text"
            value={kolId}
            onChange={(e) => setKolId(e.target.value)}
            placeholder="e.g. 1234567890 or @channel_username"
            autoFocus
            disabled={mutation.isPending}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Display title and handle are resolved automatically from Telegram.
          </p>
        </div>

        {mutation.isError && (
          <div
            role="alert"
            className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
          >
            {mutation.error.message}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
          >
            {mutation.isPending ? 'Adding…' : 'Add KOL'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
