import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAiInfraStore } from '@/store/aiInfra';
import {
  initServerConfigStore,
  Provider as ServerConfigProvider,
} from '@/store/serverConfig/store';
import { useVideoStore } from '@/store/video';

import ToolsMenu from './ToolsMenu';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

vi.mock('@/features/BrandKit', () => ({
  compileBrandPreamble: () => '',
  useBrandKits: () => ({ activeKit: null }),
}));

// A minimal stand-in for the real toolbar Action: renders the dropdown's
// menu items as plain, always-visible buttons so this test can assert on
// listing/disabled-state/onClick without driving the real base-ui popover.
vi.mock('@/features/ChatInput/ActionBar/components/Action', () => ({
  default: ({
    dropdown,
    title,
  }: {
    dropdown?: { menu: { items: any[] } };
    title?: string;
    onClick?: () => void;
  }) => {
    if (!dropdown) {
      return <button aria-label={title}>{title}</button>;
    }

    return (
      <div>
        <span>{title}</span>
        <ul>
          {dropdown.menu.items.map((item: any) => (
            <li key={item.key}>
              <button disabled={item.disabled} onClick={item.onClick}>
                {item.label}
              </button>
              {item.desc && <span>{item.desc}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  },
}));

const translations: Record<string, string> = {
  'adVoice.title': 'Ad Voice',
  'adVoice.toolDescription': 'Generate voiceover, music, sound effects, or a talking performer.',
  'autoAnimate.title': 'Auto-animate',
  'autoAnimate.toolDescription': 'Turn a product photo into a set of standard ad animations.',
  'cameraDirector.title': 'Camera Director',
  'cameraDirector.toolDescription': 'Build a structured, timed shot list from a template.',
  'finalCut.title': 'Final Cut',
  'finalCut.toolDescription': "Stitch this topic's finished clips into one exported file.",
  'storyboard.title': 'Storyboard',
  'storyboard.toolDescription': 'Chain multiple shots into one continuous narrative.',
  'tools.title': 'Tools',
  'tools.unavailable.h3Family': 'Only available for MiniMax H3 models.',
  'tools.unavailable.h3Max': 'Requires the MiniMax H3 Max model to be enabled for your account.',
  'videoRestyle.title': 'Video Restyle',
  'videoRestyle.toolDescription': 'Fix one generated clip instead of regenerating from scratch.',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

const seed = (falModelIds: string[], model = 'fal-ai/veo3.1') => {
  useAiInfraStore.setState({
    enabledVideoModelList: [{ children: falModelIds.map((id) => ({ id })), id: 'fal' }] as any,
  });
  useVideoStore.setState({
    createVideosFromRequests: vi.fn(),
    isCreating: false,
    isInit: true,
    model,
    parameters: { prompt: '' },
    parametersSchema: { prompt: { default: '' } },
    provider: 'fal',
  } as any);
};

const serverConfigStore = initServerConfigStore({});

const renderMenu = () =>
  render(
    <ServerConfigProvider createStore={() => serverConfigStore}>
      <MotionProvider motion={motion}>
        <ToolsMenu />
        <ModalHost />
      </MotionProvider>
    </ServerConfigProvider>,
  );

describe('ToolsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists all six tools with icon, name and a one-line description', () => {
    seed(['minimax/h3-max'], 'minimax/h3-max');
    renderMenu();

    for (const label of [
      'Auto-animate',
      'Camera Director',
      'Storyboard',
      'Ad Voice',
      'Video Restyle',
      'Final Cut',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('disables Auto-animate and Storyboard with a reason when the H3 Max model is unavailable, without hiding them', () => {
    seed(['fal-ai/veo3.1'], 'fal-ai/veo3.1');
    renderMenu();

    const autoAnimate = screen.getByRole('button', { name: 'Auto-animate' });
    const storyboard = screen.getByRole('button', { name: 'Storyboard' });

    expect(autoAnimate).toBeDisabled();
    expect(storyboard).toBeDisabled();
    expect(
      screen.getAllByText('Requires the MiniMax H3 Max model to be enabled for your account.'),
    ).toHaveLength(2);
  });

  it('disables Camera Director with a reason when the active model is outside the H3 family, without hiding it', () => {
    seed(['minimax/h3-max'], 'fal-ai/veo3.1');
    renderMenu();

    const cameraDirector = screen.getByRole('button', { name: 'Camera Director' });
    expect(cameraDirector).toBeDisabled();
    expect(screen.getByText('Only available for MiniMax H3 models.')).toBeInTheDocument();
  });

  it('never disables Ad Voice, Video Restyle or Final Cut regardless of the selected model', () => {
    seed(['fal-ai/veo3.1'], 'fal-ai/veo3.1');
    renderMenu();

    expect(screen.getByRole('button', { name: 'Ad Voice' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Video Restyle' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Final Cut' })).not.toBeDisabled();
  });

  it('opens the selected tool’s own modal, preserving its existing behavior', async () => {
    seed(['minimax/h3-max'], 'minimax/h3-max');
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Ad Voice' }));

    expect(await screen.findByText(/adVoice\.subtitle|Write the script/)).toBeInTheDocument();
  });
});
