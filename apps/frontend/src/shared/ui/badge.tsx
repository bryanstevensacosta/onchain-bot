import type { ReactNode } from 'react';
import { clsx } from 'clsx';

type Tone =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'blue'
  | 'gray'
  | 'cyan'
  | 'white';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

const tones: Record<Tone, string> = {
  green: 'bg-green-900/40 text-green-300 border-green-700',
  yellow: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  orange: 'bg-orange-900/40 text-orange-300 border-orange-700',
  red: 'bg-red-900/40 text-red-300 border-red-700',
  blue: 'bg-blue-900/40 text-blue-300 border-blue-700',
  cyan: 'bg-cyan-900/40 text-cyan-300 border-cyan-700',
  gray: 'bg-slate-800 text-slate-300 border-slate-700',
  white: 'bg-white/10 text-white border-white/20 backdrop-blur-sm',
};

export function Badge({ children, tone = 'gray', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
