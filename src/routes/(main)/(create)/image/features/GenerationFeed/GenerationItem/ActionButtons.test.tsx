import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ActionButtons } from './ActionButtons';

vi.mock('@lobehub/ui', async () => {
  const React = await import('react');

  return {
    ActionIconGroup: ({ items }: any) =>
      React.createElement(
        'div',
        null,
        (items ?? [])
          .filter(Boolean)
          .map((item: any) =>
            React.createElement(
              'button',
              { 'aria-label': item.label, 'key': item.key, 'onClick': item.onClick },
              item.label,
            ),
          ),
      ),
    Flexbox: ({ children, ...rest }: any) => React.createElement('div', rest, children),
  };
});

vi.mock('./styles', () => ({
  styles: {
    generationActionButton: 'generation-actions',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop(),
  }),
}));

describe('ActionButtons', () => {
  it('calls onRemoveBackground and onUpscale when their buttons are clicked', async () => {
    const onDelete = vi.fn();
    const onRemoveBackground = vi.fn();
    const onUpscale = vi.fn();
    const user = userEvent.setup();

    render(
      <ActionButtons
        onDelete={onDelete}
        onRemoveBackground={onRemoveBackground}
        onUpscale={onUpscale}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'removeBackground' }));
    await user.click(screen.getByRole('button', { name: 'upscale' }));

    expect(onRemoveBackground).toHaveBeenCalledTimes(1);
    expect(onUpscale).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('omits the tool buttons when their handlers are not provided', () => {
    render(<ActionButtons onDelete={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'removeBackground' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'upscale' })).toBeNull();
    expect(screen.getByRole('button', { name: 'delete' })).toBeTruthy();
  });
});
