import type { Chain } from '@/shared/realtime/events';

interface ChainIconProps {
  chain: Chain | string;
  className?: string;
}

const chainTone: Record<string, string> = {
  solana: 'text-purple-400',
  evm: 'text-blue-400',
};

export function ChainIcon({ chain, className = '' }: ChainIconProps) {
  const tone = chainTone[chain] ?? 'text-slate-400';

  if (chain === 'solana') {
    return (
      <svg
        viewBox="0 0 397.7 311.7"
        className={`inline-block w-4 h-4 ${tone} ${className}`}
        fill="currentColor"
        aria-label="Solana"
      >
        <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" />
        <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" />
        <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" />
      </svg>
    );
  }

  // evm / ethereum
  return (
    <svg
      viewBox="0 0 784.37 1277.39"
      className={`inline-block w-3 h-4 ${tone} ${className}`}
      fill="currentColor"
      aria-label="Ethereum"
    >
      <polygon
        fillRule="nonzero"
        points="392.07,0 383.5,29.11 383.5,873.74 392.07,882.29 784.13,650.54"
      />
      <polygon
        fillRule="nonzero"
        points="392.07,0 -0,650.54 392.07,882.29 392.07,472.33"
      />
      <polygon
        fillRule="nonzero"
        points="392.07,956.52 387.24,962.41 387.24,1263.28 392.07,1277.38 784.37,724.89"
      />
      <polygon
        fillRule="nonzero"
        points="392.07,1277.38 392.07,956.52 -0,724.89"
      />
      <polygon
        fillRule="nonzero"
        points="392.07,882.29 784.13,650.54 392.07,472.33"
      />
      <polygon
        fillRule="nonzero"
        points="0,650.54 392.07,882.29 392.07,472.33"
      />
    </svg>
  );
}
