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

vi.mock('../../api/add-kol-client', () => ({
  addKol: vi.fn(),
}));

import { addKol } from '../../api/add-kol-client';
import { AddKolModal } from '../add-kol-modal';

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(cleanup);

describe('AddKolModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen=false', () => {
    renderWithClient(<AddKolModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText('Add KOL')).not.toBeInTheDocument();
  });

  it('renders the form when isOpen=true', () => {
    renderWithClient(<AddKolModal isOpen={true} onClose={() => {}} />);
    expect(
      screen.getByRole('heading', { name: 'Add KOL' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram ID')).toBeInTheDocument();
  });

  it('disables submit when kolId is empty', () => {
    renderWithClient(<AddKolModal isOpen={true} onClose={() => {}} />);
    const submit = screen.getByRole('button', { name: /add kol/i });
    expect(submit).toBeDisabled();
  });

  it('disables submit when kolId is only whitespace', () => {
    renderWithClient(<AddKolModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Telegram ID'), {
      target: { value: '   ' },
    });
    const submit = screen.getByRole('button', { name: /add kol/i });
    expect(submit).toBeDisabled();
  });

  it('enables submit when kolId has text', () => {
    renderWithClient(<AddKolModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Telegram ID'), {
      target: { value: '123456' },
    });
    const submit = screen.getByRole('button', { name: /add kol/i });
    expect(submit).not.toBeDisabled();
  });

  it('calls addKol with the kolId on submit', async () => {
    (addKol as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '123456',
      handle: null,
      title: '123456',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    });
    const onClose = vi.fn();
    renderWithClient(<AddKolModal isOpen={true} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Telegram ID'), {
      target: { value: '  123456  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add kol/i }));
    await waitFor(() => {
      expect(addKol).toHaveBeenCalledWith('123456');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows an error message when addKol fails', async () => {
    (addKol as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Kol already registered'),
    );
    const onClose = vi.fn();
    renderWithClient(<AddKolModal isOpen={true} onClose={onClose} />);
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
    (addKol as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: '999',
      handle: null,
      title: '999',
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    });
    renderWithClient(<AddKolModal isOpen={true} onClose={() => {}} />);
    const input = screen.getByLabelText('Telegram ID') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /add kol/i }));
    await waitFor(() => {
      expect(addKol).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });
});
