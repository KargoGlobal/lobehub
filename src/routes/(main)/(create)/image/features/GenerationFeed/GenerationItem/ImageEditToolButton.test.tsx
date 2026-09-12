import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  'editTool.place.placeholder': 'e.g. on a marble kitchen counter with soft morning light',
  'editTool.place.presetStudio': 'on a plain white studio backdrop with soft even light',
  'editTool.place.presetStudioLabel': 'Studio',
  'editTool.place.promptLabel': 'Place in: {{scene}}',
  'editTool.relight.presetGolden': 'warm golden-hour light from a low angle',
  'editTool.relight.presetGoldenLabel': 'Golden hour',
  'editTool.resize.label': 'Resize to {{ratio}}',
  'editTool.title': 'Resize, place & relight',
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

describe('ImageEditToolButton', () => {
  beforeEach(() => {
    createEditedImage.mockClear();
    useImageStore.setState({ createEditedImage: createEditedImage as any });
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

  it('calls onApplied after a successful apply', async () => {
    const onApplied = vi.fn();
    render(
      <ImageEditToolButton sourceUrl={'https://cdn.example.com/a.png'} onApplied={onApplied} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
  });
});
