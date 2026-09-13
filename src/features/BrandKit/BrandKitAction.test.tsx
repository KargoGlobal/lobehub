import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserStore } from '@/store/user';

import BrandKitAction from './BrandKitAction';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

// The shared toolbar Action wraps a popover that needs the action-bar context;
// render its popover content inline so the form is reachable.
vi.mock('@/features/ChatInput/ActionBar/components/Action', () => ({
  default: ({
    onClick,
    popover,
    title,
  }: {
    onClick?: () => void;
    popover?: { content: React.ReactNode };
    title?: string;
  }) => (
    <div>
      <button aria-label={title} type={'button'} onClick={onClick}>
        {title}
      </button>
      {popover?.content}
    </div>
  ),
}));

const kit = {
  colors: ['#0F172A', '#F97316'],
  fonts: ['Inter'],
  id: 'k1',
  name: 'Acme',
  styleNotes: 'Warm daylight.',
  toneOfVoice: 'Plain-spoken.',
};

const renderAction = (props: Partial<React.ComponentProps<typeof BrandKitAction>> = {}) => {
  const onPromptChange = vi.fn();
  render(
    <MotionProvider motion={motion}>
      <BrandKitAction
        prompt={'A red mug on a desk'}
        target={'image'}
        onPromptChange={onPromptChange}
        {...props}
      />
      <ModalHost />
    </MotionProvider>,
  );
  return { onPromptChange };
};

describe('BrandKitAction', () => {
  beforeEach(() => {
    useUserStore.setState({
      isUserStateInit: true,
      setSettings: vi.fn().mockResolvedValue(undefined),
      settings: { image: { activeBrandKitId: 'k1', brandKits: [kit] } },
    } as any);
  });

  it('shows the active kit in the toolbar title and applies its preamble to the prompt', async () => {
    const { onPromptChange } = renderAction();

    expect(screen.getByRole('button', { name: /Acme/ })).toBeInTheDocument();

    const apply = screen.getByTestId('brandkit-apply');
    await waitFor(() => expect(apply).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(apply);
    });

    expect(onPromptChange).toHaveBeenCalledTimes(1);
    const next = onPromptChange.mock.calls[0][0] as string;
    expect(next.startsWith('A red mug on a desk\n\n')).toBe(true);
    expect(next).toContain('Brand: Acme.');
    expect(next).toContain('#0F172A, #F97316');
    expect(next).toContain('Inter');
  });

  it('disables Apply when no kit is active', () => {
    useUserStore.setState({
      settings: { image: { activeBrandKitId: '', brandKits: [kit] } },
    } as any);
    renderAction();
    expect(screen.getByTestId('brandkit-apply')).toBeDisabled();
  });

  it('opens the editor and saves a new kit through user settings', async () => {
    const setSettings = vi.fn().mockResolvedValue(undefined);
    useUserStore.setState({
      setSettings,
      settings: { image: { activeBrandKitId: '', brandKits: [] } },
    } as any);
    renderAction();

    fireEvent.click(screen.getByText(/manage kits|brandKit\.manage$/i));
    const name = await screen.findByTestId('brandkit-name');
    fireEvent.change(name, { target: { value: 'Northwind' } });
    const color = screen.getByTestId('brandkit-color-input');
    fireEvent.change(color, { target: { value: '#abc' } });
    fireEvent.keyDown(color, { key: 'Enter' });
    fireEvent.blur(color);

    const save = screen.getByTestId('brandkit-save');
    await waitFor(() => expect(save).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(save);
    });

    expect(setSettings).toHaveBeenCalled();
    const payload = setSettings.mock.calls[0][0];
    expect(payload.image.brandKits).toHaveLength(1);
    expect(payload.image.brandKits[0]).toMatchObject({ colors: ['#AABBCC'], name: 'Northwind' });
  });
});
