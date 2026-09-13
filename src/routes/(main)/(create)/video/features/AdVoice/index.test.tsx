import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { voiceService } from '@/services/voice';
import {
  initServerConfigStore,
  Provider as ServerConfigProvider,
} from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';
import { useVideoStore } from '@/store/video';

import AdVoiceAction from './index';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

vi.mock('@/features/ChatInput/ActionBar/components/Action', () => ({
  default: ({ onClick, title }: { onClick?: () => void; title?: string }) => (
    <button aria-label={title} type={'button'} onClick={onClick}>
      {title}
    </button>
  ),
}));

const OPEN_BUTTON = /ad voice|adVoice\.title/i;
const GENERATE_SPEECH = /generate voiceover|adVoice\.speech\.generate/i;
const PERFORMER_TAB = /^(performer|adVoice\.tab\.avatar)$/i;

const serverConfigStore = initServerConfigStore({});

const renderAction = () =>
  render(
    <ServerConfigProvider createStore={() => serverConfigStore}>
      <MotionProvider motion={motion}>
        <AdVoiceAction />
        <ModalHost />
      </MotionProvider>
    </ServerConfigProvider>,
  );

const setFlag = (enableSyntheticPerformer: boolean) => {
  serverConfigStore.setState((s) => ({
    featureFlags: { ...s.featureFlags, enableSyntheticPerformer },
  }));
};

describe('AdVoiceAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setFlag(false);
    useVideoStore.setState({
      isInit: true,
      parameters: { prompt: '' },
    } as any);
    useUserStore.setState({ settings: {} } as any);
  });

  it('generates a voiceover through the voice service and shows a player', async () => {
    const generate = vi.spyOn(voiceService, 'generate').mockResolvedValue({
      fileId: 'f1',
      kind: 'speech',
      size: 1234,
      url: 'https://files.test/vo.mp3',
    });
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));
    const script = await screen.findByTestId('advoice-script');
    fireEvent.change(script, { target: { value: 'Spring sale starts now.' } });

    const button = screen.getByTestId('advoice-generate-speech');
    await waitFor(() => expect(button).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(button);
    });

    expect(generate).toHaveBeenCalledWith({
      kind: 'speech',
      model: 'fal-ai/elevenlabs/tts/turbo-v2.5',
      params: {},
      provider: 'fal',
      text: 'Spring sale starts now.',
      voice: 'Rachel',
    });
    const player = await screen.findByTestId('audio-speech');
    expect(player).toHaveAttribute('src', 'https://files.test/vo.mp3');
  });

  it('hides the performer tab until the synthetic_performer flag is on', async () => {
    renderAction();
    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));
    await screen.findByTestId('advoice-script');
    expect(screen.queryByText(PERFORMER_TAB)).toBeNull();
  });

  it('submits a talking-photo request tagged with the disclosure marker when the flag is on', async () => {
    setFlag(true);
    vi.spyOn(voiceService, 'generate').mockResolvedValue({
      fileId: 'f1',
      kind: 'speech',
      size: 1,
      url: 'https://files.test/vo.mp3',
    });
    const createVideosFromRequests = vi.fn().mockResolvedValue(undefined);
    useVideoStore.setState({
      createVideosFromRequests,
      isInit: true,
      parameters: { imageUrl: 'https://files.test/face.jpg', prompt: '' },
    } as any);
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));
    const script = await screen.findByTestId('advoice-script');
    fireEvent.change(script, { target: { value: 'Hi there.' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('advoice-generate-speech'));
    });
    await screen.findByTestId('audio-speech');

    fireEvent.click(screen.getByText(PERFORMER_TAB));
    const generate = await screen.findByTestId('advoice-generate-avatar');
    await waitFor(() => expect(generate).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(createVideosFromRequests).toHaveBeenCalledTimes(1);
    const [requests] = createVideosFromRequests.mock.calls[0];
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe('fal-ai/bytedance/omnihuman/v1.5');
    expect(requests[0].params).toMatchObject({
      audioUrl: 'https://files.test/vo.mp3',
      disclosure: 'synthetic_performer',
      imageUrl: 'https://files.test/face.jpg',
      resolution: '1080p',
    });
  });
});
