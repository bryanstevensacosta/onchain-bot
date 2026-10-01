// @vitest-environment jsdom
import '@/test/setup';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DevRiskBadge, devRiskTone } from './dev-risk-badge';

afterEach(() => {
  cleanup();
});

describe('DevRiskBadge (dev % supply)', () => {
  it('renders N/A when null', () => {
    render(<DevRiskBadge devPctSupply={null} devWallets={null} />);
    expect(screen.getByTestId('dev-risk-badge')).toHaveTextContent('Dev N/A');
    expect(devRiskTone(null)).toBe('gray');
  });

  it('tones by concentration', () => {
    expect(devRiskTone(2)).toBe('green');
    expect(devRiskTone(8)).toBe('yellow');
    expect(devRiskTone(25)).toBe('red');
  });

  it('renders pct + wallet tooltip', () => {
    render(
      <DevRiskBadge
        devPctSupply={8.5}
        devWallets={[
          {
            wallet: 'Dev111',
            holdAmount: 1,
            percentOfSupply: 8.5,
            pnlUsd: 0,
            tag: 'dev',
          },
        ]}
      />,
    );
    expect(screen.getByTestId('dev-risk-badge')).toHaveTextContent('Dev 8.50%');
  });
});
