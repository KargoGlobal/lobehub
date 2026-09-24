import { fireEvent, render, screen } from '@testing-library/react';
import { extractVideoDefaultValues, type VideoModelParamsSchema } from 'model-bank';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAiInfraStore } from '@/store/aiInfra';
import { useVideoStore } from '@/store/video';

import DurationPopoverContent from './DurationPopoverContent';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      `${key}${options ? `:${JSON.stringify(options)}` : ''}`,
  }),
}));

const veoSchema: VideoModelParamsSchema = {
  aspectRatio: { default: '16:9', enum: ['16:9', '9:16'] },
  duration: { default: 8, enum: [4, 6, 8] },
  imageUrl: { default: null },
  prompt: { default: '' },
};

const h3MaxSchema: VideoModelParamsSchema = {
  duration: { default: 8, max: 15, min: 5, step: 1 },
  imageUrl: { default: null },
  prompt: { default: '' },
};

const veoOnlyEnabledList = [
  {
    children: [{ displayName: 'Veo 3.1', id: 'fal-ai/veo3.1', parameters: veoSchema }],
    id: 'fal',
  },
];

const veoAndH3EnabledList = [
  {
    children: [
      { displayName: 'Veo 3.1', id: 'fal-ai/veo3.1', parameters: veoSchema },
      { displayName: 'MiniMax H3 Max', id: 'minimax/h3-max', parameters: h3MaxSchema },
    ],
    id: 'fal',
  },
];

const seedVeo = (enabledVideoModelList: typeof veoOnlyEnabledList, overrides = {}) => {
  useAiInfraStore.setState({ enabledVideoModelList: enabledVideoModelList as any });
  useVideoStore.setState({
    model: 'fal-ai/veo3.1',
    parameters: { ...extractVideoDefaultValues(veoSchema), ...overrides },
    parametersSchema: veoSchema,
    provider: 'fal',
  } as any);
};

const seedH3Max = () => {
  useAiInfraStore.setState({ enabledVideoModelList: veoAndH3EnabledList as any });
  useVideoStore.setState({
    model: 'minimax/h3-max',
    parameters: extractVideoDefaultValues(h3MaxSchema),
    parametersSchema: h3MaxSchema,
    provider: 'fal',
  } as any);
};

describe('DurationPopoverContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a segmented control for an enum model (Veo)', () => {
    seedVeo(veoOnlyEnabledList);
    render(<DurationPopoverContent />);

    expect(screen.getByText('4s')).toBeInTheDocument();
    expect(screen.getByText('6s')).toBeInTheDocument();
    expect(screen.getByText('8s')).toBeInTheDocument();
    // Range-only slider ticks must not appear for an enum model.
    expect(screen.queryByText('10s')).toBeNull();
  });

  it('renders a slider with preset ticks for a range model (H3 Max)', () => {
    seedH3Max();
    render(<DurationPopoverContent />);

    expect(screen.getByText('6s')).toBeInTheDocument();
    expect(screen.getByText('10s')).toBeInTheDocument();
    expect(screen.getByText('15s')).toBeInTheDocument();
  });

  it('shows the longer-cut hint on Veo (max 8) only when H3 Max is available', () => {
    seedVeo(veoOnlyEnabledList);
    const { rerender } = render(<DurationPopoverContent />);
    // H3 Max isn't in the enabled list yet: no hint.
    expect(screen.queryByText(/config\.duration\.longerCutHint/)).toBeNull();

    seedVeo(veoAndH3EnabledList);
    rerender(<DurationPopoverContent />);
    const hint = screen.getByText(/config\.duration\.longerCutHint/);
    // "Need 10 to 15s? MiniMax H3 Max supports it" — the gap past Veo's own max (8),
    // through the target model's max (15).
    expect(hint.textContent).toContain('"min":10');
    expect(hint.textContent).toContain('"max":15');
    expect(hint.textContent).toContain('MiniMax H3 Max');
  });

  it('does not show the longer-cut hint on a range model that already reaches the ceiling (H3 Max)', () => {
    seedH3Max();
    render(<DurationPopoverContent />);

    expect(screen.queryByText(/config\.duration\.longerCutHint/)).toBeNull();
  });

  it('switching via the hint preserves the prompt and reference frame', () => {
    seedVeo(veoAndH3EnabledList, {
      imageUrl: 'https://cdn.example.com/frame.png',
      prompt: 'a cinematic product shot',
    });
    render(<DurationPopoverContent />);

    fireEvent.click(screen.getByText('config.duration.longerCutSwitch'));

    const state = useVideoStore.getState();
    expect(state.model).toBe('minimax/h3-max');
    expect(state.provider).toBe('fal');
    expect(state.parameters?.prompt).toBe('a cinematic product shot');
    expect(state.parameters?.imageUrl).toBe('https://cdn.example.com/frame.png');
  });

  it('always renders the honest ceiling copy', () => {
    seedVeo(veoOnlyEnabledList);
    render(<DurationPopoverContent />);

    expect(screen.getByText('config.duration.ceiling')).toBeInTheDocument();
  });
});
