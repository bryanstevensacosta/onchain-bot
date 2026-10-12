// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { DeliveryPolicyForm } from './delivery-policy-form';

afterEach(cleanup);

const updateMutMock = vi.fn();

vi.mock('@/features/feed-scheduling/model/use-delivery-policy', () => ({
  useDeliveryPolicy: vi.fn(),
  useUpdateDeliveryPolicy: vi.fn(),
}));

import {
  useDeliveryPolicy,
  useUpdateDeliveryPolicy,
} from '@/features/feed-scheduling/model/use-delivery-policy';

const mockedUseDeliveryPolicy = vi.mocked(useDeliveryPolicy);
const mockedUseUpdateDeliveryPolicy = vi.mocked(useUpdateDeliveryPolicy);

describe('DeliveryPolicyForm', () => {
  beforeEach(() => {
    updateMutMock.mockReset();
    mockedUseUpdateDeliveryPolicy.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: updateMutMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
  });

  it('renders the current policy values for the target', () => {
    mockedUseDeliveryPolicy.mockReturnValue({
      data: {
        delayMinMs: 60_000,
        delayMaxMs: 120_000,
        dailyCap: 20,
        resetHour: 0,
      },
      isLoading: false,
      error: null,
    } as never);
    render(<DeliveryPolicyForm target="telegram" />);
    expect(screen.getByLabelText(/Delay min/)).toHaveValue(60000);
    expect(screen.getByLabelText(/Delay max/)).toHaveValue(120000);
    expect(screen.getByLabelText(/Daily cap/)).toHaveValue(20);
    expect(screen.getByLabelText(/Reset hour/)).toHaveValue(0);
  });

  it('saves the edited policy', () => {
    mockedUseDeliveryPolicy.mockReturnValue({
      data: {
        delayMinMs: 60_000,
        delayMaxMs: 120_000,
        dailyCap: 20,
        resetHour: 0,
      },
      isLoading: false,
      error: null,
    } as never);
    render(<DeliveryPolicyForm target="threads" />);

    fireEvent.change(screen.getByLabelText(/Daily cap/), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(updateMutMock).toHaveBeenCalledWith({
      delayMinMs: 60_000,
      delayMaxMs: 120_000,
      dailyCap: 5,
      resetHour: 0,
    });
  });

  it('shows an error state when the query rejects', () => {
    mockedUseDeliveryPolicy.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    } as never);
    render(<DeliveryPolicyForm target="telegram" />);
    expect(
      screen.getByText(/Failed to load delivery policy/),
    ).toBeInTheDocument();
  });
});
