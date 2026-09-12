import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { extractVideoDefaultValues, type VideoModelParamsSchema } from 'model-bank';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoStore } from '@/store/video';

import AutoAnimateAction from './index';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

// The provider/model list normally comes from the server runtime config; feed
// the selector a fal group directly.
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

const OPEN = /auto-animate|autoAnimate\.title/i;
const GENERATE = /generate \d+ video|autoAnimate\.generate/i;
const DESCRIPTION = /slim-fit black wool pants|descriptionPlaceholder/;

const renderAction = () =>
  render(
    <MotionProvider motion={motion}>
      <AutoAnimateAction />
      <ModalHost />
    </MotionProvider>,
  );

describe('AutoAnimateAction', () => {
  beforeEach(() => {
    createVideosFromRequests.mockClear();
  });

  it('is hidden when the fal H3 Max model is not available', () => {
    seedStores(['fal-ai/veo3.1']);
    renderAction();
    expect(screen.queryByRole('button', { name: OPEN })).toBeNull();
  });

  it('turns a pants photo + description into on-model and turntable requests', async () => {
    seedStores(['minimax/h3-max', 'minimax/h3/reference-to-video'], {
      imageUrl: 'https://cdn.example.com/pants.png',
    });
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN }));
    const description = await screen.findByPlaceholderText(DESCRIPTION);
    fireEvent.change(description, { target: { value: 'slim-fit black wool pants' } });

    // Category auto-detected from the text; concepts render as selectable cards.
    const cards = await screen.findAllByRole('checkbox');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/On-model walk & turn/)).toBeInTheDocument();
    expect(screen.getByText(/Ghost turntable/)).toBeInTheDocument();

    const generate = await screen.findByRole('button', { name: GENERATE });
    await waitFor(() => expect(generate).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(createVideosFromRequests).toHaveBeenCalledTimes(1);
    const requests = createVideosFromRequests.mock.calls[0]![0];
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(requests.every((r) => r.provider === 'fal')).toBe(true);

    const walk = requests.find((r) => r.model === 'minimax/h3/reference-to-video');
    expect(walk.params.imageUrls).toEqual(['https://cdn.example.com/pants.png']);
    expect(walk.params.prompt).toContain('Image 1 is the product');
    expect(walk.params.prompt).toContain('slim-fit black wool pants');

    const turntable = requests.find((r) => r.model === 'minimax/h3-max');
    expect(turntable.params.imageUrl).toBe('https://cdn.example.com/pants.png');
    expect(turntable.params.resolution).toBe('1080P');
    expect(typeof turntable.params.seed).toBe('number');
  });

  it('deselecting a concept drops it from the batch', async () => {
    seedStores(['minimax/h3-max'], { imageUrl: 'https://cdn.example.com/can.png' });
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN }));
    const description = await screen.findByPlaceholderText(DESCRIPTION);
    fireEvent.change(description, { target: { value: 'a 330ml can of sparkling water' } });

    const cards = await screen.findAllByRole('checkbox');
    const before = cards.length;
    fireEvent.click(cards[0]);

    const generate = await screen.findByRole('button', { name: GENERATE });
    await act(async () => {
      fireEvent.click(generate);
    });
    const requests = createVideosFromRequests.mock.calls[0]![0];
    expect(requests).toHaveLength(before - 1);
  });
});
