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

vi.mock('../../api/add-kol-telegram-client', () => ({
  addKolTelegram: vi.fn(),
}));

import { addKolTelegram } from '../../api/add-kol-telegram-client';
import { AddKolTelegramModal } from '../add-kol-telegram-modal';

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(cleanup);

describe('AddKolTelegramModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen=false', () => {
    renderWithClient(<AddKolTelegramModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText('Add KOL')).not.toBeInTheDocument();
  });

  it('renders the form when isOpen=true', () => {
    renderWithClient(<AddKolTelegramModal isOpen={true} onClose={() => {}} />);
    expect(
      screen.getByRole('heading', { name: 'Add KOL' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram ID')).toBeInTheDocument();
  });

  it('disables submit when kolId is empty', () => {
    renderWithClient(<AddKolTelegramModal isOpen={true} onClose={() => {}} />);
    const submit = screen.getByRole('button', { name: /add kol/i });
    expect(submit).toBeDisabled();
  });

  it('disables submit when kolId is only whitespace', () => {
    renderWithClient(<AddKolTelegramModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Telegram ID'), {
      target: { value: '   ' },
    });
    const submit = screen.getByRole('button', { name: /add kol/i });
    expect(submit).toBeDisabled();
  });

  it('enables submit when kolId has text', () => {
    renderWithClient(<AddKolTelegramModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Telegram ID'), {
      target: { value: '123456' },
    });
    const submit = screen.getByRole('button', { name: /add kol/i });
    expect(submit).not.toBeDisabled();
  });

  it('calls addKolTelegram with the kolId on submit', async () => {
    (addKolTelegram as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '123456',
      handle: null,
      title: '123456',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    });
    const onClose = vi.fn();
    renderWithClient(<AddKolTelegramModal isOpen={true} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Telegram ID'), {
      target: { value: '  123456  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add kol/i }));
    await waitFor(() => {
      expect(addKolTelegram).toHaveBeenCalledWith('123456');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows an error message when addKolTelegram fails', async () => {
    (addKolTelegram as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Kol already registered'),
    );
    const onClose = vi.fn();
    renderWithClient(<AddKolTelegramModal isOpen={true} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Telegram ID'), {
      target: { value: 'dup' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add kol/i }));
    await waitFor(() => {
      expect(screen.getByText('Kol already registered')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears the input after a successful submit', async () => {
    (addKolTelegram as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '999',
      handle: null,
      title: '999',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    });
    renderWithClient(<AddKolTelegramModal isOpen={true} onClose={() => {}} />);
    const input = screen.getByLabelText('Telegram ID') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /add kol/i }));
    await waitFor(() => {
      expect(addKolTelegram).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });
});
