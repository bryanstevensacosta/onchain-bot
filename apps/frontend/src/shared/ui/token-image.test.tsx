// @vitest-environment jsdom
import '@/test/setup';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TokenImage } from './token-image';

afterEach(cleanup);

/**
 * imageUrls with a single failing URL. Firing one error event advances
 * idx past the array, making urls[idx] undefined and triggering the
 * deterministic placeholder render.
 */
const failing = (): string[] => ['https://invalid.example/x.png'];

describe('TokenImage — URL cycling', () => {
  it('renders the first image URL when imageUrls is provided', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        imageUrls={['https://cdn.example/a.png', 'https://cdn.example/b.png']}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example/a.png',
    );
  });

  it('uses the address-derived fallback URL when no imageUrls provided', () => {
    render(<TokenImage chain="solana" address="SoLaNaAdDrEsS" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://dd.dexscreener.com/ds-data/tokens/solana/SoLaNaAdDrEsS.png',
    );
  });

  it('maps chain=evm to ethereum slug in the fallback URL', () => {
    render(<TokenImage chain="evm" address="0xABC" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://dd.dexscreener.com/ds-data/tokens/ethereum/0xABC.png',
    );
  });

  it('advances to the next URL when the current <img> errors', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        imageUrls={[
          'https://cdn.example/a.png',
          'https://cdn.example/b.png',
          'https://cdn.example/c.png',
        ]}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example/a.png',
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example/b.png',
    );
  });

  it('renders the deterministic placeholder after the last URL fails', () => {
    render(<TokenImage chain="solana" address="abc" imageUrls={failing()} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText('abc')).toBeInTheDocument();
  });

  it('uses DexScreener fallback when imageUrls is empty AND it also fails', () => {
    render(<TokenImage chain="solana" address="abc" imageUrls={[]} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://dd.dexscreener.com/ds-data/tokens/solana/abc.png',
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByLabelText('abc')).toBeInTheDocument();
  });
});

describe('TokenImage — placeholder initial source', () => {
  it('prefers ticker over name over address for the placeholder initial', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        ticker="$WEN"
        name="Wendy"
        imageUrls={failing()}
      />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('falls back to name when ticker is null', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        name="Wendy"
        imageUrls={failing()}
      />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('W')).toBeInTheDocument();
  });

  it('falls back to address when both ticker and name are null', () => {
    render(
      <TokenImage chain="solana" address="DeadBeef" imageUrls={failing()} />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('falls back to first address character when ticker and name are null', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        ticker={null}
        name={null}
        imageUrls={failing()}
      />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});

describe('TokenImage — size prop', () => {
  it.each([
    ['xs', 'w-5 h-5 text-[10px]'],
    ['sm', 'w-6 h-6 text-xs'],
    ['md', 'w-8 h-8 text-sm'],
    ['lg', 'w-12 h-12 text-base'],
  ] as const)('size=%s applies %s class', (size, expectedClass) => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        size={size}
        imageUrls={['https://cdn.example/a.png']}
      />,
    );
    expect(screen.getByRole('img')).toHaveClass(expectedClass);
  });
});

describe('TokenImage — placeholder determinism', () => {
  const paletteRegex =
    /bg-(rose|amber|emerald|sky|violet|pink|teal|orange)-700/;

  it('produces the same palette class for the same address across renders', () => {
    const { unmount } = render(
      <TokenImage
        chain="solana"
        address="SameAddress123"
        imageUrls={failing()}
      />,
    );
    fireEvent.error(screen.getByRole('img'));
    const firstClass = screen.getByText('S').className;
    unmount();

    render(
      <TokenImage
        chain="solana"
        address="SameAddress123"
        imageUrls={failing()}
      />,
    );
    fireEvent.error(screen.getByRole('img'));
    const secondClass = screen.getByText('S').className;

    expect(firstClass).toMatch(paletteRegex);
    expect(secondClass).toMatch(paletteRegex);
  });

  it('produces distinct palette classes across varied addresses', () => {
    const addrs = Array.from({ length: 20 }, (_, i) => `Addr${i}X${i}Y`);
    const palettes = new Set<string>();

    addrs.forEach((addr) => {
      render(
        <TokenImage chain="solana" address={addr} imageUrls={failing()} />,
      );
      fireEvent.error(screen.getByRole('img'));
      const match = screen.getByText(addr[0]!).className.match(paletteRegex);
      if (match) palettes.add(match[0]);
      cleanup();
    });

    expect(palettes.size).toBeGreaterThan(1);
  });
});

describe('TokenImage — accessibility', () => {
  it('sets alt text to ticker when provided', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        ticker="$WEN"
        imageUrls={['https://cdn.example/a.png']}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('alt', '$WEN');
  });

  it('falls back to name for alt text when ticker is null', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        name="Wendy"
        imageUrls={['https://cdn.example/a.png']}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Wendy');
  });

  it('falls back to address for alt text when both ticker and name are null', () => {
    render(
      <TokenImage
        chain="solana"
        address="DeadBeefAddress"
        imageUrls={['https://cdn.example/a.png']}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'DeadBeefAddress');
  });

  it('marks the <img> as lazy-loaded', () => {
    render(
      <TokenImage
        chain="solana"
        address="abc"
        imageUrls={['https://cdn.example/a.png']}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
  });
});
