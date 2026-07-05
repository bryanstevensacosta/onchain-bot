// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/entities/crypto-news/model/use-crypto-news', () => ({
  useCryptoNewsMessages: vi.fn(),
  useCryptoNewsSources: vi.fn(),
}));

import {
  useCryptoNewsMessages,
  useCryptoNewsSources,
} from '@/entities/crypto-news/model/use-crypto-news';
import { CryptoNewsPage } from '../index';
import type {
  CryptoNewsMessage,
  CryptoNewsSource,
} from '@/entities/crypto-news/api/crypto-news-queries';

const mockedUseMessages = vi.mocked(useCryptoNewsMessages);
const mockedUseSources = vi.mocked(useCryptoNewsSources);

function renderWithClient(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseSource: CryptoNewsSource = {
  channelId: 'WatcherGuru',
  handle: '@WatcherGuru',
  title: 'WatcherGuru',
  isActive: true,
  lifecycleStatus: 'ACTIVE',
  addedAt: '2025-01-01T00:00:00.000Z',
};

function makeMessagesQuery(data: ReadonlyArray<CryptoNewsMessage>) {
  return {
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useCryptoNewsMessages>;
}

function makeSourcesQuery(data: ReadonlyArray<CryptoNewsSource>) {
  return {
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useCryptoNewsSources>;
}

afterEach(cleanup);

describe('CryptoNewsPage — media rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
  });

  it('renders <img> for each media item with correct src and alt', () => {
    const msgWithMedia: CryptoNewsMessage = {
      id: 'msg-1',
      channelId: 'WatcherGuru',
      messageId: 42,
      title: 'BTC pump incoming',
      content: 'Some content here.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [
        {
          id: 'media-1',
          index: 0,
          type: 'photo',
          url: '/api/crypto-news/media/media-1',
          mimeType: 'image/jpeg',
        },
        {
          id: 'media-2',
          index: 1,
          type: 'photo',
          url: '/api/crypto-news/media/media-2',
          mimeType: 'image/png',
        },
      ],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithMedia]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    const imgs = within(article).getAllByRole('img');

    expect(imgs).toHaveLength(2);

    expect(imgs[0]).toHaveAttribute('src', '/api/crypto-news/media/media-1');
    expect(imgs[0]).toHaveAttribute('alt', 'BTC pump incoming 1');
    expect(imgs[0]).toHaveAttribute('loading', 'lazy');

    expect(imgs[1]).toHaveAttribute('src', '/api/crypto-news/media/media-2');
    expect(imgs[1]).toHaveAttribute('alt', 'BTC pump incoming 2');
  });

  it('renders no <img> when media array is empty', () => {
    const msgWithoutMedia: CryptoNewsMessage = {
      id: 'msg-2',
      channelId: 'WatcherGuru',
      messageId: 43,
      title: 'Plain text only',
      content: 'No images here.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithoutMedia]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    expect(within(article).queryByRole('img')).toBeNull();
    // Content is still rendered
    expect(within(article).getByText('No images here.')).toBeInTheDocument();
  });

  it('handles backward-compat case where media is undefined (no crash, no <img>)', () => {
    const legacyMsg = {
      id: 'msg-3',
      channelId: 'WatcherGuru',
      messageId: 44,
      title: 'Legacy message',
      content: 'Pre-media-feature payload.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      // media field intentionally absent (legacy payload)
    } as unknown as CryptoNewsMessage;

    mockedUseMessages.mockReturnValue(makeMessagesQuery([legacyMsg]));

    // Must not throw
    expect(() => renderWithClient(<CryptoNewsPage />)).not.toThrow();

    const article = screen.getByRole('article');
    expect(within(article).queryByRole('img')).toBeNull();
    expect(
      within(article).getByText('Pre-media-feature payload.'),
    ).toBeInTheDocument();
  });
});

describe('CryptoNewsPage — source handle/link rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders message with source handle as clickable link to public Telegram URL', () => {
    const sourceWithHandle: CryptoNewsSource = {
      channelId: '123',
      handle: '@test-handle',
      title: 'Test Source',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgWithHandle: CryptoNewsMessage = {
      id: 'msg-1',
      channelId: '123',
      messageId: 5,
      title: 'Test Message',
      content: 'Content here.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([sourceWithHandle]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithHandle]));

    renderWithClient(<CryptoNewsPage />);

    const link = screen.getByRole('link', { name: /test-handle/i });
    expect(link).toHaveAttribute('href', 'https://t.me/test-handle/5');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders message with source no handle (private channel) using c/ URL format', () => {
    const sourceNoHandle: CryptoNewsSource = {
      channelId: '123',
      handle: null,
      title: 'Test Channel',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgNoHandle: CryptoNewsMessage = {
      id: 'msg-2',
      channelId: '123',
      messageId: 5,
      title: 'Private Message',
      content: 'Secret content.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([sourceNoHandle]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgNoHandle]));

    renderWithClient(<CryptoNewsPage />);

    const link = screen.getByRole('link', { name: /Test Channel/i });
    expect(link).toHaveAttribute('href', 'https://t.me/c/123/5');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders source not found - falls back to raw channelId without link', () => {
    const otherSource: CryptoNewsSource = {
      channelId: 'other-channel',
      handle: '@OtherChannel',
      title: 'Other Channel',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgUnknown: CryptoNewsMessage = {
      id: 'msg-3',
      channelId: 'unknown-channel',
      messageId: 99,
      title: 'Unknown Message',
      content: 'Some content.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([otherSource]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgUnknown]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    expect(within(article).getByText('unknown-channel')).toBeInTheDocument();
    const links = within(article).queryAllByRole('link');
    expect(links).toHaveLength(0);
  });
});

describe('CryptoNewsPage — formatting entities rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSources.mockReturnValue(makeSourcesQuery([baseSource]));
  });

  it('renders text_url entity as anchor link', () => {
    const msgWithLink: CryptoNewsMessage = {
      id: 'msg-link',
      channelId: 'WatcherGuru',
      messageId: 100,
      title: 'Link test',
      content: 'Check out this site click here for more info',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: [
        {
          offset: 20,
          length: 10,
          type: 'text_url',
          url: 'https://example.com',
        },
      ],
    };

    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgWithLink]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    const allLinks = within(article).getAllByRole('link');
    const contentLink = allLinks.find(
      (l) => l.getAttribute('href') === 'https://example.com',
    );
    expect(contentLink).toBeDefined();
    expect(contentLink).toHaveAttribute('target', '_blank');
    expect(contentLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders text without entities as plain text (no anchor tags)', () => {
    const sourceNoHandle: CryptoNewsSource = {
      channelId: '123456',
      handle: null,
      title: 'No Handle Channel',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    const msgPlainText: CryptoNewsMessage = {
      id: 'msg-plain',
      channelId: '123456',
      messageId: 101,
      title: 'Plain text test',
      content: 'This is just plain text with no formatting.',
      publishedAt: '2025-01-01T00:00:00.000Z',
      ingestedAt: '2025-01-01T00:00:01.000Z',
      media: [],
      linkPreviewUrl: null,
      linkPreviewTitle: null,
      linkPreviewDescription: null,
      linkPreviewSiteName: null,
      formattingEntities: undefined,
    };

    mockedUseSources.mockReturnValue(makeSourcesQuery([sourceNoHandle]));
    mockedUseMessages.mockReturnValue(makeMessagesQuery([msgPlainText]));

    renderWithClient(<CryptoNewsPage />);

    const article = screen.getByRole('article');
    const contentPara = within(article).getByText(
      'This is just plain text with no formatting.',
    );
    expect(contentPara).toBeInTheDocument();
    expect(contentPara).not.toHaveAttribute('href');
  });
});
