// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SchedulingRotationConfigForm } from './scheduling-rotation-config-form';

afterEach(cleanup);

const updateMutMock = vi.fn();

vi.mock('@/features/feed-scheduling/model/use-scheduling', () => ({
  useRotationConfig: vi.fn(),
  useUpdateRotationConfig: vi.fn(),
}));

import {
  useRotationConfig,
  useUpdateRotationConfig,
} from '@/features/feed-scheduling/model/use-scheduling';

const mockedUseRotationConfig = vi.mocked(useRotationConfig);
const mockedUseUpdateRotationConfig = vi.mocked(useUpdateRotationConfig);

describe('SchedulingRotationConfigForm', () => {
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
      data: { enabled: true, everyNPosts: 6, minMinutesBetweenScheduling: 45 },
      isLoading: false,
      error: null,
    } as never);
    render(<SchedulingRotationConfigForm />);
    expect(screen.getByLabelText(/Scheduling enabled/)).toBeChecked();
    expect(screen.getByLabelText(/Every N posts/)).toHaveValue(6);
    expect(screen.getByLabelText(/Min minutes between scheduling/)).toHaveValue(
      45,
    );
  });

  it('saves the edited config', () => {
    mockedUseRotationConfig.mockReturnValue({
      data: { enabled: false, everyNPosts: 4, minMinutesBetweenScheduling: 30 },
      isLoading: false,
      error: null,
    } as never);
    render(<SchedulingRotationConfigForm />);

    fireEvent.change(screen.getByLabelText(/Every N posts/), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(updateMutMock).toHaveBeenCalledWith({
      enabled: false,
      everyNPosts: 8,
      minMinutesBetweenScheduling: 30,
    });
  });

  it('shows an error state when the query rejects', () => {
    mockedUseRotationConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    } as never);
    render(<SchedulingRotationConfigForm />);
    expect(
      screen.getByText(/Failed to load rotation config/),
    ).toBeInTheDocument();
  });
});
