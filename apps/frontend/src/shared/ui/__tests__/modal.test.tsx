// @vitest-environment jsdom
import '@/test/setup';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Modal } from '../modal';

afterEach(cleanup);

describe('Modal', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}} title="Test">
        content
      </Modal>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title and children when isOpen=true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Title">
        <p>Test content</p>
      </Modal>,
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('× button calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        content
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC key calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        content
      </Modal>,
    );
    const backdrop = document.body.querySelector(
      '.fixed.inset-0.z-50',
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click inside card does NOT call onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <button id="inner-btn">Inner Button</button>
      </Modal>,
    );
    // Click the inner button inside the card
    fireEvent.click(screen.getByRole('button', { name: 'Inner Button' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders in a portal attached to document.body', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={() => {}} title="Test">
        content
      </Modal>,
    );
    // Portal should be appended to document.body
    expect(
      document.body.querySelector('.fixed.inset-0.z-50'),
    ).toBeInTheDocument();
    // Clean up
    unmount();
    expect(
      document.body.querySelector('.fixed.inset-0.z-50'),
    ).not.toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={() => {}} title="Test" size="sm">
        content
      </Modal>,
    );
    expect(document.body.querySelector('.max-w-sm')).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={() => {}} title="Test" size="md">
        content
      </Modal>,
    );
    expect(document.body.querySelector('.max-w-md')).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={() => {}} title="Test" size="lg">
        content
      </Modal>,
    );
    expect(document.body.querySelector('.max-w-lg')).toBeInTheDocument();
  });

  it('backdrop click does NOT call onClose with closeOnBackdropClick=false', () => {
    const onClose = vi.fn();
    render(
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Test"
        closeOnBackdropClick={false}
      >
        content
      </Modal>,
    );
    const backdrop = document.body.querySelector(
      '.fixed.inset-0.z-50',
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ESC key does NOT call onClose with closeOnEscape=false', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test" closeOnEscape={false}>
        content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('× button still closes with both closeOnBackdropClick and closeOnEscape false', () => {
    const onClose = vi.fn();
    render(
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Test"
        closeOnBackdropClick={false}
        closeOnEscape={false}
      >
        content
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC key still closes when only closeOnBackdropClick=false', () => {
    const onClose = vi.fn();
    render(
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Test"
        closeOnBackdropClick={false}
      >
        content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
