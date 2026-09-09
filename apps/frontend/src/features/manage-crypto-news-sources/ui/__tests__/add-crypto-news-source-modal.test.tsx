// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpError } from '@/shared/api/http-client';

vi.mock('../../model/use-add-crypto-news-source', () => ({
  useAddCryptoNewsSource: vi.fn(),
}));

import { useAddCryptoNewsSource } from '../../model/use-add-crypto-news-source';
import { AddCryptoNewsSourceModal } from '../add-crypto-news-source-modal';

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockHookReturn(
  overrides: {
    mutateAsync?: ReturnType<typeof vi.fn>;
    isPending?: boolean;
    isError?: boolean;
    error?: Error | null;
    reset?: ReturnType<typeof vi.fn>;
  } = {},
) {
  (
    useAddCryptoNewsSource as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue({
    mutateAsync: overrides.mutateAsync ?? vi.fn(),
    isPending: overrides.isPending ?? false,
    isError: overrides.isError ?? false,
    error: overrides.error ?? null,
    reset: overrides.reset ?? vi.fn(),
  });
}

afterEach(cleanup);

describe('AddCryptoNewsSourceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookReturn();
  });

  it('renders nothing when isOpen=false', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={false} onClose={() => {}} />,
    );
    expect(screen.queryByText('Add Source')).not.toBeInTheDocument();
  });

  it('renders the modal title when isOpen=true', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={() => {}} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Add Source' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram Channel ID')).toBeInTheDocument();
  });

  it('disables the submit button when channelId is empty', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={() => {}} />,
    );
    const submit = screen.getByRole('button', { name: /add source/i });
    expect(submit).toBeDisabled();
  });

  it('disables the submit button when channelId is non-numeric', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText('Telegram Channel ID'), {
      target: { value: 'WatcherGuru' },
    });
    const submit = screen.getByRole('button', { name: /add source/i });
    expect(submit).toBeDisabled();
  });

  it('disables the submit button when channelId is only whitespace', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText('Telegram Channel ID'), {
      target: { value: '   ' },
    });
    const submit = screen.getByRole('button', { name: /add source/i });
    expect(submit).toBeDisabled();
  });

  it('disables the submit button when channelId does not have -100 prefix', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText('Telegram Channel ID'), {
      target: { value: '1234567890' },
    });
    const submit = screen.getByRole('button', { name: /add source/i });
    expect(submit).toBeDisabled();
  });

  it('enables the submit button when channelId has -100 prefix', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText('Telegram Channel ID'), {
      target: { value: '-1001234567890' },
    });
    const submit = screen.getByRole('button', { name: /add source/i });
    expect(submit).not.toBeDisabled();
  });

  it('submits the trimmed channelId via mutateAsync and closes on success', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      channelId: '-1001234567890',
      handle: 'WatcherGuru',
      title: 'WatcherGuru',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2026-07-03T00:00:00.000Z',
    });
    mockHookReturn({ mutateAsync });
    const onClose = vi.fn();
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={onClose} />,
    );
    fireEvent.change(screen.getByLabelText('Telegram Channel ID'), {
      target: { value: '  -1001234567890  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add source/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ channelId: '-1001234567890' });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows an error message when mutateAsync rejects', async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(
        new HttpError(409, 'CONFLICT', 'Source already registered'),
      );
    mockHookReturn({
      mutateAsync,
      isError: true,
      error: new HttpError(409, 'CONFLICT', 'Source already registered'),
    });
    const onClose = vi.fn();
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={onClose} />,
    );
    fireEvent.change(screen.getByLabelText('Telegram Channel ID'), {
      target: { value: '-1001234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add source/i }));
    await waitFor(() => {
      expect(screen.getByText('Source already registered')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close the modal when cancel is clicked while mutation is pending', () => {
    mockHookReturn({ isPending: true });
    const onClose = vi.fn();
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close the modal when the backdrop is clicked while mutation is pending', () => {
    mockHookReturn({ isPending: true });
    const onClose = vi.fn();
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets the input when the modal is closed via the cancel button', () => {
    renderWithClient(
      <AddCryptoNewsSourceModal isOpen={true} onClose={() => {}} />,
    );
    const input = screen.getByLabelText(
      'Telegram Channel ID',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-1001234567890' } });
    expect(input.value).toBe('-1001234567890');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(input.value).toBe('');
  });
});
