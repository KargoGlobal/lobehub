import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFileStore } from '@/store/file';
import { useVideoStore } from '@/store/video';

import VideoRestyleAction from './index';

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

const OPEN_BUTTON = /video restyle|videoRestyle\.title/i;

const renderAction = () =>
  render(
    <MotionProvider motion={motion}>
      <VideoRestyleAction />
      <ModalHost />
    </MotionProvider>,
  );

describe('VideoRestyleAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useVideoStore.setState({ isInit: true, parameters: { prompt: '' } } as any);
  });

  it('uploads a clip, picks an engine, and submits a restyle request', async () => {
    const uploadWithProgress = vi.fn().mockResolvedValue({ url: 'https://files.test/clip.mp4' });
    useFileStore.setState({ uploadWithProgress } as any);
    const createVideosFromRequests = vi.fn().mockResolvedValue(undefined);
    useVideoStore.setState({ createVideosFromRequests } as any);

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));

    await screen.findByTestId('restyle-upload-clip');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['clip'], 'clip.mp4', { type: 'video/mp4' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(uploadWithProgress).toHaveBeenCalledTimes(1);
    await screen.findByTestId('restyle-clip-preview');

    const prompt = screen.getByTestId('restyle-prompt');
    fireEvent.change(prompt, { target: { value: 'Swap the jacket for a red one' } });

    const generate = screen.getByTestId('restyle-generate');
    await waitFor(() => expect(generate).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(createVideosFromRequests).toHaveBeenCalledTimes(1);
    const [requests] = createVideosFromRequests.mock.calls[0];
    expect(requests).toEqual([
      {
        model: 'decart/lucy-edit/pro',
        params: {
          prompt: 'Swap the jacket for a red one',
          videoUrl: 'https://files.test/clip.mp4',
        },
        provider: 'fal',
      },
    ]);
  });

  it('disables generate until both a clip and a prompt are present', async () => {
    useFileStore.setState({ uploadWithProgress: vi.fn() } as any);
    renderAction();
    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));
    const generate = await screen.findByTestId('restyle-generate');
    expect(generate).toBeDisabled();
  });

  it('switches to the Kling engine and forwards the selected model', async () => {
    const uploadWithProgress = vi.fn().mockResolvedValue({ url: 'https://files.test/clip.mp4' });
    useFileStore.setState({ uploadWithProgress } as any);
    const createVideosFromRequests = vi.fn().mockResolvedValue(undefined);
    useVideoStore.setState({ createVideosFromRequests } as any);

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: OPEN_BUTTON }));

    await screen.findByTestId('restyle-upload-clip');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['clip'], 'clip.mp4', { type: 'video/mp4' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    await screen.findByTestId('restyle-clip-preview');

    fireEvent.click(screen.getByText('Kling O3 Edit [Pro]'));

    const prompt = screen.getByTestId('restyle-prompt');
    fireEvent.change(prompt, { target: { value: 'Restyle as claymation' } });

    const generate = screen.getByTestId('restyle-generate');
    await waitFor(() => expect(generate).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(generate);
    });

    const [requests] = createVideosFromRequests.mock.calls[0];
    expect(requests[0].model).toBe('fal-ai/kling-video/o3/pro/video-to-video/edit');
  });
});
