// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AdsRotationConfigForm } from './ads-rotation-config-form';

afterEach(cleanup);

const updateMutMock = vi.fn();

vi.mock('@/features/crypto-news-ads/model/use-ads', () => ({
  useRotationConfig: vi.fn(),
  useUpdateRotationConfig: vi.fn(),
}));

import {
  useRotationConfig,
  useUpdateRotationConfig,
} from '@/features/crypto-news-ads/model/use-ads';

const mockedUseRotationConfig = vi.mocked(useRotationConfig);
const mockedUseUpdateRotationConfig = vi.mocked(useUpdateRotationConfig);

describe('AdsRotationConfigForm', () => {
  beforeEach(() => {
    updateMutMock.mockReset();
    mockedUseUpdateRotationConfig.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: updateMutMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
  });

  it('renders the current config values', () => {
    mockedUseRotationConfig.mockReturnValue({
      data: { enabled: true, everyNPosts: 6, minMinutesBetweenAds: 45 },
      isLoading: false,
      error: null,
    } as never);
    render(<AdsRotationConfigForm />);
    expect(screen.getByLabelText(/Ads enabled/)).toBeChecked();
    expect(screen.getByLabelText(/Every N posts/)).toHaveValue(6);
    expect(screen.getByLabelText(/Min minutes between ads/)).toHaveValue(45);
  });

  it('saves the edited config', () => {
    mockedUseRotationConfig.mockReturnValue({
      data: { enabled: false, everyNPosts: 4, minMinutesBetweenAds: 30 },
      isLoading: false,
      error: null,
    } as never);
    render(<AdsRotationConfigForm />);

    fireEvent.change(screen.getByLabelText(/Every N posts/), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(updateMutMock).toHaveBeenCalledWith({
      enabled: false,
      everyNPosts: 8,
      minMinutesBetweenAds: 30,
    });
  });

  it('shows an error state when the query rejects', () => {
    mockedUseRotationConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    } as never);
    render(<AdsRotationConfigForm />);
    expect(
      screen.getByText(/Failed to load rotation config/),
    ).toBeInTheDocument();
  });
});
