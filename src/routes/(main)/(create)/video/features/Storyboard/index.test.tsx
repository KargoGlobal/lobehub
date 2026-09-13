import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { extractVideoDefaultValues, type VideoModelParamsSchema } from 'model-bank';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoStore } from '@/store/video';

import StoryboardAction from './index';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

vi.mock('@/features/BrandKit', () => ({
  compileBrandPreamble: () => '',
  useBrandKits: () => ({ activeKit: null }),
}));

// The provider/model list normally comes from the server runtime config; feed
// the selector a fal group directly, same as Auto-animate's test.
const infra = vi.hoisted(() => ({ falModels: [] as string[] }));
vi.mock('@/store/aiInfra', () => ({
  aiProviderSelectors: {
    enabledVideoModelList: () => [{ children: infra.falModels.map((id) => ({ id })), id: 'fal' }],
  },
  useAiInfraStore: (selector: (s: unknown) => unknown) => selector({}),
}));

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

const createVideosFromRequests = vi.fn<(requests: any[]) => Promise<void>>(async () => {});

const h3Schema: VideoModelParamsSchema = {
  aspectRatio: { default: '16:9', enum: ['16:9', '9:16', '1:1'] },
  duration: { default: 8, max: 15, min: 5, step: 1 },
  imageUrl: { default: null },
  prompt: { default: '' },
  resolution: { default: '1080P', enum: ['480P', '768P', '1080P'] },
  seed: { default: null },
};

const seedStores = (falModels: string[], overrides: Record<string, unknown> = {}) => {
  infra.falModels = falModels;
  useVideoStore.setState({
    createVideosFromRequests: createVideosFromRequests as any,
    isCreating: false,
    isInit: true,
    model: 'minimax/h3-max',
    parameters: { ...extractVideoDefaultValues(h3Schema), ...overrides },
    parametersSchema: h3Schema,
    provider: 'fal',
  });
};

const OPEN = /storyboard/i;
const GENERATE = /generate \d+ shot|storyboard\.generate/i;

const renderAction = () =>
  render(
    <MotionProvider motion={motion}>
      <StoryboardAction />
      <ModalHost />
    </MotionProvider>,
  );

describe('StoryboardAction', () => {
  beforeEach(() => {
    createVideosFromRequests.mockClear();
  });

  it('is hidden when the fal H3 Max model is not available', () => {
    seedStores(['fal-ai/veo3.1']);
    renderAction();
    expect(screen.queryByRole('button', { name: OPEN })).toBeNull();
  });

  it('shown with a default two-shot plan, and generates in order on submit', async () => {
    seedStores(['minimax/h3-max']);
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN }));

    // Describe the product so Camera Director validation passes for every shot.
    // No i18next instance is wired up in this unit test, so `t()` falls back to
    // returning the raw key — match either the real copy or that fallback.
    const productField = await screen.findByPlaceholderText(
      /330ml matte black aluminium can with a silver pull tab|productPlaceholder/,
    );
    fireEvent.change(productField, {
      target: { value: 'a 330ml matte black aluminium energy drink can' },
    });

    const generate = await screen.findByRole('button', { name: GENERATE });
    await waitFor(() => expect(generate).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(generate);
    });

    expect(createVideosFromRequests).toHaveBeenCalledTimes(1);
    const requests = createVideosFromRequests.mock.calls[0]![0];
    expect(requests).toHaveLength(2);
    expect(requests.every((r: any) => r.provider === 'fal')).toBe(true);
    expect(requests.every((r: any) => r.model === 'minimax/h3-max')).toBe(true);
    expect(requests[0].params.prompt).toContain('shot 1 of 2');
    expect(requests[1].params.prompt).toContain('shot 2 of 2');
    expect(requests[1].params.prompt).toContain('Continuing directly from shot 1');
  });

  it('adds, reorders and removes shots', async () => {
    seedStores(['minimax/h3-max']);
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN }));
    await screen.findAllByRole('textbox');

    // No i18next instance in this unit test, so button names fall back to the
    // raw translation key — match either the real copy or that fallback.
    // Each shot card renders exactly one duration spinbutton, so its count is
    // a reliable proxy for the number of shots on screen.
    const addShot = screen.getByRole('button', { name: /add shot|shots\.add/i });
    fireEvent.click(addShot);
    fireEvent.click(addShot);

    // 2 default + 2 added = 4 shots.
    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(4);
    });

    const removeButtons = screen.getAllByRole('button', { name: /remove shot|shots\.remove/i });
    fireEvent.click(removeButtons.at(-1)!);

    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton')).toHaveLength(3);
    });

    const moveLater = screen.getAllByRole('button', { name: /move shot later|shots\.moveDown/i });
    // First shot can move later; clicking it should not throw, and the shot
    // count should stay unchanged.
    fireEvent.click(moveLater[0]);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3);
  });

  it('blocks submission until every shot is valid', async () => {
    seedStores(['minimax/h3-max']);
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN }));
    await screen.findAllByRole('textbox');

    // Subject is blank by default, so Camera Director validation should fail
    // for both shots and the generate button should stay disabled.
    const generate = await screen.findByRole('button', { name: GENERATE });
    expect(generate).toBeDisabled();
    expect(createVideosFromRequests).not.toHaveBeenCalled();
  });
});
