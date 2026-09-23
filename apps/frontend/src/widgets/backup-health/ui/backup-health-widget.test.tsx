// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { BackupHealthWidget } from './backup-health-widget';
import type { BackupStatus } from '../model/types';

const { fetchBackupHealthMock } = vi.hoisted(() => ({
  fetchBackupHealthMock: vi.fn(),
}));

vi.mock('../api/backup-health-queries', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../api/backup-health-queries')>();
  return { ...original, fetchBackupHealth: fetchBackupHealthMock };
});

afterEach(() => {
  cleanup();
  fetchBackupHealthMock.mockReset();
});

function makeWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function makeStatus(overrides: Partial<BackupStatus> = {}): BackupStatus {
  return {
    verdict: 'green',
    newestFile: 'backup-2026-09-20.sql.gz',
    newestAgeH: '2h',
    dumpCount: 12,
    diskPct: 45,
    bucket: 's3://alpha-meta-backups',
    offsiteLag: '1h',
    lastDrillAt: '2026-09-01',
    lastDrillResult: 'pass',
    stale: false,
    ...overrides,
  };
}

describe('BackupHealthWidget', () => {
  it('renders loading state while fetching', () => {
    fetchBackupHealthMock.mockReturnValue(new Promise(() => {}));
    render(<BackupHealthWidget />, { wrapper: makeWrapper() });
    expect(
      screen.getByText('Cargando estado de respaldos…'),
    ).toBeInTheDocument();
  });

  it('renders green verdict with data', async () => {
    fetchBackupHealthMock.mockResolvedValue(makeStatus());
    render(<BackupHealthWidget />, { wrapper: makeWrapper() });
    expect(await screen.findByText('GREEN')).toBeInTheDocument();
    expect(screen.getByText(/backup-2026-09-20\.sql\.gz/)).toBeInTheDocument();
    expect(screen.getByText('s3://alpha-meta-backups')).toBeInTheDocument();
  });

  it('renders amber verdict with stale warning', async () => {
    fetchBackupHealthMock.mockResolvedValue(
      makeStatus({ verdict: 'amber', stale: true }),
    );
    render(<BackupHealthWidget />, { wrapper: makeWrapper() });
    expect(await screen.findByText('AMBER')).toBeInTheDocument();
    expect(screen.getByText(/Datos desactualizados/)).toBeInTheDocument();
  });

  it('renders red verdict with — null glyph for missing optionals', async () => {
    fetchBackupHealthMock.mockResolvedValue(
      makeStatus({
        verdict: 'red',
        bucket: null,
        offsiteLag: null,
        lastDrillAt: null,
        lastDrillResult: 'unknown',
      }),
    );
    render(<BackupHealthWidget />, { wrapper: makeWrapper() });
    expect(await screen.findByText('RED')).toBeInTheDocument();
    const nullGlyphs = screen.getAllByText('—');
    expect(nullGlyphs.length).toBeGreaterThan(0);
  });

  it('renders Offline card on fetch error without crashing', async () => {
    fetchBackupHealthMock.mockRejectedValue(new Error('backend down'));
    render(<BackupHealthWidget />, { wrapper: makeWrapper() });
    expect(await screen.findByText('Offline')).toBeInTheDocument();
    expect(screen.getByText(/Backup Health/)).toBeInTheDocument();
  });
});
