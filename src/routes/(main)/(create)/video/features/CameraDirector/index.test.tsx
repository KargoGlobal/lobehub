import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { extractVideoDefaultValues, type VideoModelParamsSchema } from 'model-bank';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoStore } from '@/store/video';

import CameraDirectorAction from './index';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

// The shared toolbar Action needs the server-config store and action-bar
// context; a plain button is enough to drive the Director here.
vi.mock('@/features/ChatInput/ActionBar/components/Action', () => ({
  default: ({
    disabled,
    onClick,
    title,
  }: {
    disabled?: boolean;
    onClick?: () => void;
    title?: string;
  }) => (
    <button aria-label={title} disabled={disabled} type={'button'} onClick={onClick}>
      {title}
    </button>
  ),
}));

const h3Schema: VideoModelParamsSchema = {
  aspectRatio: { default: '16:9', enum: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
  duration: { default: 8, max: 15, min: 5, step: 1 },
  endImageUrl: { default: null, requiresImageUrl: true },
  imageUrl: { default: null },
  prompt: { default: '' },
  promptExtend: { default: 'balanced', enum: ['balanced', 'quality'] },
  resolution: { default: '1080P', enum: ['480P', '768P', '1080P'] },
  seed: { default: null },
};

const seedStore = (model: string, overrides: Record<string, unknown> = {}) => {
  useVideoStore.setState({
    isInit: true,
    model,
    parameters: { ...extractVideoDefaultValues(h3Schema), ...overrides },
    parametersSchema: h3Schema,
    provider: 'fal',
  });
};

// The test i18n instance may hand back raw keys, so match either form.
const OPEN_BUTTON = /camera director|cameraDirector\.title/i;
const APPLY_BUTTON = /apply to prompt|cameraDirector\.apply$/i;
const PRODUCT_PLACEHOLDER = /330ml matte black aluminium can|productPlaceholder/;
const BACKGROUND_TEMPLATE = /3D Background Loop|template\.background3d/;
const PRODUCT_TEMPLATE = /3D Product Ad|template\.product3d/;

const renderAction = () =>
  render(
    <MotionProvider motion={motion}>
      <CameraDirectorAction />
      <ModalHost />
    </MotionProvider>,
  );

describe('CameraDirectorAction', () => {
  beforeEach(() => {
    seedStore('minimax/h3-max');
  });

  it('is hidden for models outside the MiniMax H3 family', () => {
    seedStore('fal-ai/veo3.1');
    renderAction();
    expect(screen.queryByRole('button', { name: OPEN_BUTTON })).toBeNull();
  });

  it('opens the Director for H3 Max and blocks Apply until the product is described', async () => {
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));

    const apply = await screen.findByRole('button', { name: APPLY_BUTTON });
    expect(apply).toBeDisabled();
    expect(screen.getByText('✕ Describe the product.')).toBeInTheDocument();
    // Both default recipes are offered.
    expect(screen.getByText(PRODUCT_TEMPLATE)).toBeInTheDocument();
    expect(screen.getByText(BACKGROUND_TEMPLATE)).toBeInTheDocument();
  });

  it('applies a compiled product-ad prompt plus recommended settings to the workspace', async () => {
    seedStore('minimax/h3-max', { duration: 5, resolution: '768P' });
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));
    const subject = await screen.findByPlaceholderText(PRODUCT_PLACEHOLDER);
    fireEvent.change(subject, { target: { value: 'a matte white running shoe with a neon sole' } });

    const apply = await screen.findByRole('button', { name: APPLY_BUTTON });
    await waitFor(() => expect(apply).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(apply);
    });

    const { parameters } = useVideoStore.getState();
    expect(parameters.prompt).toContain('Subject: a matte white running shoe with a neon sole.');
    expect(parameters.prompt).toContain('Timeline:');
    expect(parameters.prompt).toMatch(/^0–5s: /m);
    expect(parameters.prompt).toContain('non_diegetic_music: N/A');
    // Director kept the workspace duration (5s) and upgraded delivery settings.
    expect(parameters.duration).toBe(5);
    expect(parameters.resolution).toBe('1080P');
    expect(parameters.promptExtend).toBe('quality');
    expect(parameters.aspectRatio).toBe('16:9');
  });

  it('forces loop closure by mirroring the start frame into the end frame for a background loop', async () => {
    seedStore('minimax/h3-max', { imageUrl: 'https://cdn.example.com/bg.png' });
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));
    fireEvent.click(await screen.findByText(BACKGROUND_TEMPLATE));

    const apply = await screen.findByRole('button', { name: APPLY_BUTTON });
    await waitFor(() => expect(apply).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(apply);
    });

    const { parameters } = useVideoStore.getState();
    expect(parameters.endImageUrl).toBe('https://cdn.example.com/bg.png');
    expect(parameters.prompt).toContain('Reference: the opening frame sets the scene.');
    expect(parameters.prompt).toContain('Loop: the final frame matches the opening frame exactly');
    expect(parameters.promptExtend).toBe('balanced');
  });
});
