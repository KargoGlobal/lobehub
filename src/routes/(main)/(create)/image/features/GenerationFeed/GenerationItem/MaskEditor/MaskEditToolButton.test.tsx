import { MotionProvider } from '@lobehub/ui';
import { ModalHost } from '@lobehub/ui/base-ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { motion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFileStore } from '@/store/file';
import { useImageStore } from '@/store/image';

import MaskEditToolButton from './MaskEditToolButton';

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

const DICT: Record<string, string> = {
  'maskEditor.apply': 'Apply',
  'maskEditor.canvasLabel': 'Paint the area to edit',
  'maskEditor.mode.erase': 'Erase',
  'maskEditor.mode.replace': 'Replace',
  'maskEditor.promptPlaceholder': 'e.g. a glass of iced tea with a lemon slice',
  'maskEditor.title': 'Erase & replace',
  'maskEditor.undo': 'Undo',
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => DICT[key] ?? key }),
}));

const createEditedImage = vi.fn().mockResolvedValue(undefined);
const uploadWithProgress = vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/mask.png' });

// jsdom has no 2D canvas, pointer capture, or layout — stub just enough.
const ctxCalls: string[] = [];
const fakeCtx = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'lineWidth') return '';
      return () => {
        ctxCalls.push(String(prop));
      };
    },
    set: () => true,
  },
) as CanvasRenderingContext2D;

const renderButton = () =>
  render(
    <MotionProvider motion={motion}>
      <MaskEditToolButton sourceUrl={'https://cdn.example.com/src.png'} />
      <ModalHost />
    </MotionProvider>,
  );

const openAndLoadImage = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Erase & replace' }));
  const img = (await screen.findByTestId('mask-editor-image')) as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1000 });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 500 });
  fireEvent.load(img);
  const canvas = screen.getByTestId('mask-editor-canvas') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () =>
    ({ bottom: 250, height: 250, left: 0, right: 500, top: 0, width: 500, x: 0, y: 0 }) as DOMRect;
  return canvas;
};

const paint = (canvas: HTMLCanvasElement) => {
  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 150, clientY: 75, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
};

describe('MaskEditToolButton', () => {
  beforeEach(() => {
    createEditedImage.mockClear();
    uploadWithProgress.mockClear();
    ctxCalls.length = 0;
    useImageStore.setState({ createEditedImage: createEditedImage as any });
    useFileStore.setState({ uploadWithProgress: uploadWithProgress as any });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx) as any;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb: BlobCallback) {
      cb(new Blob(['png'], { type: 'image/png' }));
    }) as any;
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  });

  it('keeps Apply disabled until something is painted, then erases via bria/eraser', async () => {
    renderButton();
    const canvas = await openAndLoadImage();
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    paint(canvas);
    expect(apply).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(apply);
    });

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    // Mask uploaded as a PNG file, then attached as mask_url.
    expect(uploadWithProgress).toHaveBeenCalledTimes(1);
    const uploadedFile = uploadWithProgress.mock.calls[0][0].file as File;
    expect(uploadedFile.name).toBe('mask.png');
    expect(uploadedFile.type).toBe('image/png');
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/src.png', {
      model: 'fal-ai/bria/eraser',
      params: {
        mask_type: 'manual',
        mask_url: 'https://cdn.example.com/mask.png',
        prompt: 'Erase painted area',
      },
    });
    // The export pass painted a black background then white strokes.
    expect(ctxCalls).toContain('fillRect');
  });

  it('in Replace mode also requires a prompt, then calls flux-pro/v1/fill', async () => {
    renderButton();
    const canvas = await openAndLoadImage();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    paint(canvas);

    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/iced tea/), {
      target: { value: 'a ceramic mug' },
    });
    expect(apply).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(apply);
    });

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/src.png', {
      model: 'fal-ai/flux-pro/v1/fill',
      params: {
        mask_url: 'https://cdn.example.com/mask.png',
        num_images: 1,
        output_format: 'png',
        prompt: 'a ceramic mug',
      },
    });
  });

  it('Undo removes the last stroke and disables Apply again', async () => {
    renderButton();
    const canvas = await openAndLoadImage();
    paint(canvas);
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(apply).toBeDisabled();
    expect(createEditedImage).not.toHaveBeenCalled();
  });
});
