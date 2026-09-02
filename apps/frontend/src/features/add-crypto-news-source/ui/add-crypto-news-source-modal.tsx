import { useState, type FormEvent } from 'react';
import { Button, Modal } from '@/shared/ui';
import { useAddCryptoNewsSource } from '../model/use-add-crypto-news-source';

interface AddCryptoNewsSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddCryptoNewsSourceModal({
  isOpen,
  onClose,
}: AddCryptoNewsSourceModalProps) {
  const [channelId, setChannelId] = useState('');
  const mutation = useAddCryptoNewsSource();

  const trimmed = channelId.trim();
  // Channel ID must start with -100 (Telegram supergroup/channel prefix)
  const isValidChannelId = /^-100\d+$/.test(trimmed);
  const canSubmit = isValidChannelId && !mutation.isPending;

  function handleClose() {
    if (mutation.isPending) return;
    setChannelId('');
    mutation.reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await mutation.mutateAsync({ channelId: trimmed });
      setChannelId('');
      onClose();
    } catch {
      // error surfaced via mutation.error
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Source" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="add-crypto-news-channelId"
            className="block text-xs uppercase text-slate-400 mb-1"
          >
            Telegram Channel ID
          </label>
          <input
            id="add-crypto-news-channelId"
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g. -1001234567890"
            autoFocus
            disabled={mutation.isPending}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Channel ID must start with -100 prefix (Telegram channel format).
            Display title and handle are resolved automatically.
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
            {mutation.isPending ? 'Adding…' : 'Add Source'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
