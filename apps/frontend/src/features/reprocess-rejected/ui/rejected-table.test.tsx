// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { RejectedTable } from './rejected-table';
import type { RejectedTokenDiagnostics } from '../api/reprocess-client';

afterEach(cleanup);

function makeRow(
  overrides: Partial<RejectedTokenDiagnostics> = {},
): RejectedTokenDiagnostics {
  return {
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    currentVerdict: 'REJECTED',
    score: 25,
    classification: 'MEME',
    reasons: [
      { code: 'SCORE_TOO_LOW', message: 'Score 25 < 50' },
      { code: 'BLACKLISTED', message: 'Token is on blacklist' },
    ],
    snapshotCompleteness: 0.42,
    providerErrors: [],
    retryable: true,
    retryableReasons: [],
    blockedReasons: [{ code: 'BLACKLISTED', message: 'Token is on blacklist' }],
    recommended: 'REPROCESS',
    decidedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RejectedTable — reason label rendering', () => {
  it('renders "Score too low" and "Blacklisted" (human-readable)', () => {
    render(
      <RejectedTable
        data={[makeRow()]}
        isLoading={false}
        onReprocessOne={vi.fn()}
        isReprocessingOne={false}
      />,
    );

    expect(screen.getByText('Score too low')).toBeInTheDocument();
    expect(screen.getByText('Blacklisted')).toBeInTheDocument();
  });

  it('does not leak raw reason codes into the DOM', () => {
    const { container } = render(
      <RejectedTable
        data={[
          makeRow({
            reasons: [
              { code: 'SCORE_TOO_LOW', message: '' },
              { code: 'BLACKLISTED', message: '' },
              { code: 'HONEYPOT_SUSPECTED', message: '' },
              { code: 'CHAIN_UNSUPPORTED', message: '' },
              { code: 'INSUFFICIENT_DATA', message: '' },
              { code: 'RISK_WEIGHT_EXCEEDED', message: '' },
              { code: 'CLASSIFICATION_BLOCKED', message: '' },
            ],
          }),
        ]}
        isLoading={false}
        onReprocessOne={vi.fn()}
        isReprocessingOne={false}
      />,
    );

    expect(container.textContent).not.toContain('SCORE_TOO_LOW');
    expect(container.textContent).not.toContain('BLACKLISTED');
    expect(container.textContent).not.toContain('HONEYPOT_SUSPECTED');
    expect(container.textContent).not.toContain('CHAIN_UNSUPPORTED');
    expect(container.textContent).not.toContain('INSUFFICIENT_DATA');
    expect(container.textContent).not.toContain('RISK_WEIGHT_EXCEEDED');
    expect(container.textContent).not.toContain('CLASSIFICATION_BLOCKED');

    expect(screen.getByText('Score too low')).toBeInTheDocument();
    expect(screen.getByText('Blacklisted')).toBeInTheDocument();
    expect(screen.getByText('Honeypot suspected')).toBeInTheDocument();
    expect(screen.getByText('Chain unsupported')).toBeInTheDocument();
    expect(screen.getByText('Insufficient data')).toBeInTheDocument();
    expect(screen.getByText('Risk weight exceeded')).toBeInTheDocument();
    expect(screen.getByText('Classification blocked')).toBeInTheDocument();
  });

  it('renders without error (table tree is correct) and shows reprocess button', () => {
    const onReprocess = vi.fn();
    render(
      <RejectedTable
        data={[makeRow()]}
        isLoading={false}
        onReprocessOne={onReprocess}
        isReprocessingOne={false}
      />,
    );

    const row = screen.getByText('Score too low').closest('tr') as HTMLElement;
    expect(row).toBeInTheDocument();

    const button = within(row).getByRole('button', { name: /Reprocess/i });
    expect(button).toBeInTheDocument();

    button.click();
    expect(onReprocess).toHaveBeenCalledWith('solana', expect.any(String));
  });

  it('shows loading state', () => {
    render(
      <RejectedTable
        data={[]}
        isLoading={true}
        onReprocessOne={vi.fn()}
        isReprocessingOne={false}
      />,
    );

    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(
      <RejectedTable
        data={[]}
        isLoading={false}
        onReprocessOne={vi.fn()}
        isReprocessingOne={false}
      />,
    );

    expect(screen.getByText('No hay tokens rechazados.')).toBeInTheDocument();
  });

  it('shows "—" placeholder when recommended is not REPROCESS', () => {
    render(
      <RejectedTable
        data={[makeRow({ recommended: 'SKIP' })]}
        isLoading={false}
        onReprocessOne={vi.fn()}
        isReprocessingOne={false}
      />,
    );

    expect(screen.getByText('Score too low')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
