import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFileStore } from '@/store/file';
import { useImageStore } from '@/store/image';

import ImageEditToolButton from './ImageEditToolButton';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

// The shared toolbar Action needs the server-config store and action-bar
// context; a plain button + always-rendered content is enough to drive this
// popover's form in tests (mirrors the video Camera Director test's approach).
vi.mock('@/features/ChatInput/ActionBar/components/Action', () => ({
  default: ({ popover, title }: { popover?: { content?: React.ReactNode }; title?: string }) => (
    <div>
      <button aria-label={title} type={'button'}>
        {title}
      </button>
      {popover?.content}
    </div>
  ),
}));

// The test i18n instance doesn't preload the 'image' namespace (see
// tests/setup.ts), so mirror the real English copy here deterministically —
// several of these strings are functional (they're sent to fal as the actual
// relight/placement instruction), not just labels, so the test should assert
// against real content rather than raw keys.
const DICT: Record<string, string> = {
  'editTool.apply': 'Apply',
  'editTool.mode.place': 'Place',
  'editTool.mode.relight': 'Relight',
  'editTool.mode.resize': 'Resize',
  'editTool.mode.tryon': 'Try-on',
  'editTool.mode.typography': 'Typography',
  'editTool.tryon.category.auto': 'Auto-detect',
  'editTool.tryon.category.bottoms': 'Bottoms',
  'editTool.tryon.category.one-pieces': 'One-piece',
  'editTool.tryon.category.tops': 'Tops',
  'editTool.tryon.upload': 'Upload person photo',
  'editTool.place.placeholder': 'e.g. on a marble kitchen counter with soft morning light',
  'editTool.place.presetStudio': 'on a plain white studio backdrop with soft even light',
  'editTool.place.presetStudioLabel': 'Studio',
  'editTool.place.promptLabel': 'Place in: {{scene}}',
  'editTool.relight.presetGolden': 'warm golden-hour light from a low angle',
  'editTool.relight.presetGoldenLabel': 'Golden hour',
  'editTool.resize.label': 'Resize to {{ratio}}',
  'editTool.title': 'Resize, place, relight, try-on & typography',
  'editTool.typography.placeholder': 'e.g. SUMMER SALE — 30% OFF',
  'editTool.typography.promptLabel':
    '{{description}}. Text to render clearly and accurately: "{{headline}}"',
  'editTool.typography.promptLabelNoDescription':
    'Text to render clearly and accurately: "{{headline}}"',
  'editTool.typography.quality.BALANCED': 'Balanced',
  'editTool.typography.quality.QUALITY': 'Best',
  'editTool.typography.quality.TURBO': 'Fast',
  'editTool.typography.style.photo': 'Photo-realistic',
  'editTool.typography.style.vector': 'Vector & poster',
  'editTool.typography.descriptionPlaceholder': 'e.g. summer sale banner, bold colors',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const template = DICT[key] ?? key;
      return vars
        ? template.replaceAll(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ''))
        : template;
    },
  }),
}));

const createEditedImage = vi.fn().mockResolvedValue(undefined);
const uploadWithProgress = vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/person.png' });

describe('ImageEditToolButton', () => {
  beforeEach(() => {
    createEditedImage.mockClear();
    uploadWithProgress.mockClear();
    useImageStore.setState({ createEditedImage: createEditedImage as any });
    useFileStore.setState({ uploadWithProgress: uploadWithProgress as any });
  });

  it('applies a resize request with the selected aspect ratio', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/a.png', {
      model: 'fal-ai/image-editing/reframe',
      params: { aspectRatio: '16:9', prompt: 'Resize to 16:9' },
    });
  });

  it('blocks Apply in Place mode until a scene is described, then sends it', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Place' }));
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/marble kitchen counter/), {
      target: { value: 'on a sunlit windowsill' },
    });
    expect(apply).not.toBeDisabled();
    fireEvent.click(apply);

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/a.png', {
      model: 'fal-ai/bria/product-shot',
      params: {
        fast: true,
        num_results: 1,
        placement_type: 'automatic',
        prompt: 'Place in: on a sunlit windowsill',
        scene_description: 'on a sunlit windowsill',
      },
    });
  });

  it('fills the scene field from a preset chip', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Place' }));
    fireEvent.click(screen.getByRole('button', { name: 'Studio' }));

    const field = screen.getByPlaceholderText(/marble kitchen counter/) as HTMLTextAreaElement;
    expect(field.value).toContain('studio backdrop');
  });

  it('blocks Apply in Relight mode until a description is entered, then sends it', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Relight' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Golden hour' }));
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).not.toBeDisabled();
    fireEvent.click(apply);

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/a.png', {
      model: 'fal-ai/iclight-v2',
      params: { prompt: 'warm golden-hour light from a low angle' },
    });
  });

  it('Try-on blocks Apply until a person photo is uploaded, then sends the fashn request', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/pants.png'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try-on' }));
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    const file = new File(['(binary)'], 'person.jpg', { type: 'image/jpeg' });
    const input = screen.getByTestId('tryon-model-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() => expect(uploadWithProgress).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apply).not.toBeDisabled());

    fireEvent.click(apply);
    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/pants.png', {
      model: 'fal-ai/fashn/tryon/v1.6',
      params: {
        category: 'auto',
        garment_image: 'https://cdn.example.com/pants.png',
        mode: 'quality',
        model_image: 'https://cdn.example.com/person.png',
        num_samples: 1,
        output_format: 'png',
        prompt: 'Try on (auto)',
      },
    });
  });

  it('blocks Apply in Typography mode until a headline is entered, then sends the Ideogram request', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. SUMMER SALE — 30% OFF'), {
      target: { value: 'SUMMER SALE' },
    });
    expect(apply).not.toBeDisabled();
    fireEvent.click(apply);

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/a.png', {
      model: 'ideogram/v4',
      params: {
        prompt: 'Text to render clearly and accurately: "SUMMER SALE"',
        quality: 'BALANCED',
      },
    });
  });

  it('folds an optional scene description into the typography prompt', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. SUMMER SALE — 30% OFF'), {
      target: { value: 'SUMMER SALE' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. summer sale banner, bold colors'), {
      target: { value: 'a bold retail banner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/a.png', {
      model: 'ideogram/v4',
      params: {
        prompt: 'a bold retail banner. Text to render clearly and accurately: "SUMMER SALE"',
        quality: 'BALANCED',
      },
    });
  });

  it('switches to the Recraft vector model (without a quality param) in Vector style', async () => {
    render(<ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vector & poster' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. SUMMER SALE — 30% OFF'), {
      target: { value: 'SUMMER SALE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(createEditedImage).toHaveBeenCalledTimes(1));
    expect(createEditedImage).toHaveBeenCalledWith('https://cdn.example.com/a.png', {
      model: 'fal-ai/recraft/v4/pro/text-to-vector',
      params: { prompt: 'Text to render clearly and accurately: "SUMMER SALE"' },
    });
  });

  it('calls onApplied after a successful apply', async () => {
    const onApplied = vi.fn();
    render(
      <ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} onApplied={onApplied} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
  });
});
