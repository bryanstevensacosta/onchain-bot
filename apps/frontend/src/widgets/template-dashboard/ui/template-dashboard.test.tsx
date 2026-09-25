// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CallsTable } from './calls-table';
import { PerformanceRanking } from './performance-ranking';
import { TopCallersStrip } from './top-callers-strip';
import { TemplateConfigSection } from './template-config-section';
import type {
  KolRankingRow,
  TemplateCallRow,
  TemplateView,
} from '@/entities/template';

afterEach(cleanup);

const CALLS: Array<TemplateCallRow> = [
  {
    mentionId: 'ch1:100:0',
    kolId: 'ch1',
    kolHandle: '@alpha',
    kolTitle: 'Alpha',
    kolUrl: 'https://t.me/alpha',
    avatarUrl: null,
    ticker: 'BONK',
    chain: 'solana',
    address: 'Addr1111111111111111111111111111111111111111',
    score: 82,
    mcAt: 2_500_000,
    timesCalled: 1,
    tracking: 'First time',
    scoredAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    breakdown: [],
  },
  {
    mentionId: 'ch2:200:0',
    kolId: 'ch2',
    kolHandle: '@beta',
    kolTitle: 'Beta',
    kolUrl: 'https://t.me/beta',
    avatarUrl: null,
    ticker: 'WIF',
    chain: 'solana',
    address: 'Addr2222222222222222222222222222222222222222',
    score: 74,
    mcAt: 9_000_000,
    timesCalled: 3,
    tracking: '3x from last call',
    scoredAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    breakdown: [{ factor: 'LIQUIDITY', delta: 8, note: 'deep' }],
  },
];

const RANKINGS: Array<KolRankingRow> = [
  {
    caller: 'ch1',
    window: '30d',
    totalX: 55,
    callsCount: 4,
    strongCalls: 2,
    display: '+55X',
  },
  {
    caller: 'ch2',
    window: '30d',
    totalX: 3,
    callsCount: 7,
    strongCalls: 0,
    display: '+3X',
  },
];

const TEMPLATE: TemplateView = {
  id: 'vip-calls',
  name: 'vip-calls',
  active: true,
  kolSourceIds: [],
  minVisibleScore: 50,
  gemMinScore: 70,
  gemPatterns: ['pump\\.fun'],
  rankingStrategy: 'score',
  rankingLimit: 50,
  botId: null,
  channelTarget: null,
  adminVerifiedAt: null,
  canPublish: false,
};

describe('CallsTable', () => {
  it('renders First time and Nx rows with db-ids', () => {
    render(<CallsTable rows={CALLS} isLoading={false} isError={false} />);
    expect(screen.getByTestId('kol-calls-table')).toBeInTheDocument();
    expect(screen.getByText('First time')).toBeInTheDocument();
    expect(screen.getByText('3x from last call')).toBeInTheDocument();
    expect(screen.getByTestId('db-id-ch1:100:0')).toHaveTextContent(
      'ch1:100:0',
    );
  });

  it('API down renders empty state, not a crash', () => {
    render(<CallsTable rows={[]} isLoading={false} isError={true} />);
    expect(screen.getByTestId('calls-table-empty')).toBeInTheDocument();
  });
});

describe('PerformanceRanking', () => {
  it('renders 5+5 halves with sort arrows', () => {
    const rows: Array<KolRankingRow> = Array.from({ length: 10 }, (_, i) => ({
      caller: `c${i}`,
      window: '30d' as const,
      totalX: 10 - i,
      callsCount: i + 1,
      strongCalls: 0,
      display: `+${10 - i}X`,
    }));
    render(
      <PerformanceRanking rows={rows} isLoading={false} isError={false} />,
    );
    expect(screen.getByTestId('kol-rankings-table')).toBeInTheDocument();
    expect(screen.getByTestId('perf-half-left').children).toHaveLength(5);
    expect(screen.getByTestId('perf-half-right').children).toHaveLength(5);
    expect(screen.getByTestId('perf-sort-toggle')).toBeInTheDocument();
  });

  it('API down renders empty state', () => {
    render(<PerformanceRanking rows={[]} isLoading={false} isError={true} />);
    expect(screen.getByTestId('perf-ranking-empty')).toBeInTheDocument();
  });
});

describe('TopCallersStrip', () => {
  it('renders 30D/7D/1D selector and caller counts', () => {
    render(
      <TopCallersStrip
        rows={RANKINGS}
        window="30d"
        onWindowChange={() => {}}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByTestId('window-selector')).toBeInTheDocument();
    expect(screen.getByTestId('window-30d')).toBeInTheDocument();
    expect(screen.getByTestId('window-7d')).toBeInTheDocument();
    expect(screen.getByTestId('window-1d')).toBeInTheDocument();
    expect(screen.getByTestId('top-caller-ch1')).toBeInTheDocument();
  });
});

describe('TemplateConfigSection', () => {
  it('renders extended config (sources, score, gems, bot)', () => {
    render(
      <TemplateConfigSection
        template={TEMPLATE}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByTestId('template-config')).toBeInTheDocument();
    expect(screen.getByTestId('config-sources')).toHaveTextContent(
      'All sources',
    );
    expect(screen.getByTestId('config-min-score')).toHaveTextContent('50');
    expect(screen.getByTestId('config-gems')).toHaveTextContent('70');
    expect(screen.getByTestId('config-bot')).toHaveTextContent(
      'dashboard-only',
    );
  });
});
