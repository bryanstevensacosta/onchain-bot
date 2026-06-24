// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ScoreBreakdown } from './score-gauge';

afterEach(cleanup);

describe('ScoreBreakdown — signal label rendering', () => {
  it('renders "No holders" for factor SIGNAL_NO_HOLDERS', () => {
    render(
      <ScoreBreakdown
        factors={[{ factor: 'SIGNAL_NO_HOLDERS', delta: -10, note: '' }]}
      />,
    );

    expect(screen.getByText('No holders')).toBeInTheDocument();
    expect(screen.queryByText('SIGNAL_NO_HOLDERS')).not.toBeInTheDocument();
  });

  it('renders "Possible rug pull" for factor SIGNAL_POSSIBLE_RUG', () => {
    render(
      <ScoreBreakdown
        factors={[
          { factor: 'SIGNAL_POSSIBLE_RUG', delta: -25, note: 'red flag' },
        ]}
      />,
    );

    expect(screen.getByText('Possible rug pull')).toBeInTheDocument();
    expect(screen.queryByText('SIGNAL_POSSIBLE_RUG')).not.toBeInTheDocument();
  });

  it('renders "High Liquidity" for preserved factor LIQUIDITY_HIGH', () => {
    render(
      <ScoreBreakdown
        factors={[{ factor: 'LIQUIDITY_HIGH', delta: 15, note: '' }]}
      />,
    );

    expect(screen.getByText('High Liquidity')).toBeInTheDocument();
    expect(screen.queryByText('LIQUIDITY_HIGH')).not.toBeInTheDocument();
  });

  it('does not leak any raw enum code into the DOM for SIGNAL_* factors', () => {
    const rawCodes = [
      'SIGNAL_NO_HOLDERS',
      'SIGNAL_POSSIBLE_RUG',
      'SIGNAL_NO_NAME',
      'SIGNAL_LOW_LIQUIDITY',
      'SIGNAL_NO_PAIRS',
      'SIGNAL_CONCENTRATED_HOLDERS',
      'SIGNAL_EXTREME_PRICE_CHANGE',
      'SIGNAL_MICROCAP',
      'SIGNAL_NO_MARKET_DATA',
    ];

    const { container } = render(
      <ScoreBreakdown
        factors={rawCodes.map((code, i) => ({
          factor: code,
          delta: -1 * (i + 1),
          note: '',
        }))}
      />,
    );

    for (const code of rawCodes) {
      expect(container.textContent).not.toContain(code);
    }

    expect(screen.getByText('No holders')).toBeInTheDocument();
    expect(screen.getByText('Possible rug pull')).toBeInTheDocument();
    expect(screen.getByText('No token name')).toBeInTheDocument();
    expect(screen.getByText('Low liquidity')).toBeInTheDocument();
    expect(screen.getByText('No trading pairs')).toBeInTheDocument();
    expect(screen.getByText('Concentrated holders')).toBeInTheDocument();
    expect(screen.getByText('Extreme price change')).toBeInTheDocument();
    expect(screen.getByText('Micro-cap')).toBeInTheDocument();
    expect(screen.getByText('No market data')).toBeInTheDocument();
  });

  it('falls back to humanized label for unknown SIGNAL_ code', () => {
    render(
      <ScoreBreakdown
        factors={[
          { factor: 'SIGNAL_FUTURE_THING', delta: 5, note: 'experimental' },
        ]}
      />,
    );

    expect(screen.getByText('Future thing')).toBeInTheDocument();
    expect(screen.queryByText('SIGNAL_FUTURE_THING')).not.toBeInTheDocument();
    expect(screen.getByText('experimental')).toBeInTheDocument();
  });

  it('falls back to humanized label for unknown code without prefix', () => {
    render(
      <ScoreBreakdown
        factors={[{ factor: 'MADE_UP_CODE', delta: 0, note: '' }]}
      />,
    );

    expect(screen.getByText('Made up code')).toBeInTheDocument();
    expect(screen.queryByText('MADE_UP_CODE')).not.toBeInTheDocument();
  });

  it('renders multiple factors and renders all of their labels', () => {
    render(
      <ScoreBreakdown
        factors={[
          { factor: 'LIQUIDITY_HIGH', delta: 20, note: '' },
          { factor: 'HOLDERS_NONE', delta: -5, note: '' },
          { factor: 'SIGNAL_HONEYPOT', delta: -30, note: '' },
        ]}
      />,
    );

    expect(screen.getByText('High Liquidity')).toBeInTheDocument();
    expect(screen.getByText('No Holders')).toBeInTheDocument();
    expect(screen.getByText('Honeypot risk')).toBeInTheDocument();
  });
});
