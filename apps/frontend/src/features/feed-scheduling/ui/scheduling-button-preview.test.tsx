// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { SchedulingButtonPreview } from './scheduling-button-preview';
import type { SchedulingButton } from '../api/scheduling-api';

afterEach(cleanup);

describe('SchedulingButtonPreview', () => {
  it('renders nothing when no buttons are configured', () => {
    const { container } = render(<SchedulingButtonPreview buttons={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a "Buttons (N)" label and one link per button', () => {
    const buttons: SchedulingButton[] = [
      { text: 'One', url: 'https://example.com/1' },
      { text: 'Two', url: 'https://example.com/2' },
    ];
    const { container, getByText } = render(
      <SchedulingButtonPreview buttons={buttons} />,
    );
    getByText('Buttons (2)');
    const anchors = container.querySelectorAll('a');
    expect(anchors).toHaveLength(2);
    expect(anchors[0].textContent).toBe('One');
    expect(anchors[0].getAttribute('href')).toBe('https://example.com/1');
  });

  it('renders every received button — the preview itself has no cap', () => {
    const buttons: SchedulingButton[] = Array.from({ length: 8 }, (_, i) => ({
      text: `L${i}`,
      url: `https://example.com/${i}`,
    }));
    const { container, getByText } = render(
      <SchedulingButtonPreview buttons={buttons} />,
    );
    getByText('Buttons (8)');
    expect(container.querySelectorAll('a')).toHaveLength(8);
  });

  it('renders duplicate URLs as separate buttons (keyed by index)', () => {
    const buttons: SchedulingButton[] = [
      { text: 'A', url: 'https://example.com/x' },
      { text: 'B', url: 'https://example.com/x' },
    ];
    const { container } = render(<SchedulingButtonPreview buttons={buttons} />);
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
