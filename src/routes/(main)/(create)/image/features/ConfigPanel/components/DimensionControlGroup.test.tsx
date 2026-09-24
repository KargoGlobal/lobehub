import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useImageStore } from '@/store/image';

import DimensionControlGroup from './DimensionControlGroup';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop(),
  }),
}));

describe('DimensionControlGroup', () => {
  it('hides the lock toggle for an aspectRatio-only schema (GPT Image 2 / Nano Banana 2 on fal)', () => {
    useImageStore.setState({
      parametersSchema: {
        aspectRatio: { default: '16:9', enum: ['1:1', '16:9', '9:16'] },
        imageUrls: { default: [] },
        prompt: { default: '' },
      },
      parameters: { prompt: '', aspectRatio: '16:9', imageUrls: [] },
      activeAspectRatio: null,
    });

    render(<DimensionControlGroup />);

    // The ratio picker itself must still render.
    expect(screen.getByText('16:9')).toBeInTheDocument();
    // width/height (and therefore the lock that keeps them in ratio) don't
    // exist on this schema, so the lock toggle is dead UI and must not render.
    expect(screen.queryByLabelText('lock')).toBeNull();
    expect(screen.queryByLabelText('unlock')).toBeNull();
  });

  it('still renders the lock toggle for a width/height schema', () => {
    useImageStore.setState({
      parametersSchema: {
        height: { default: 1024, max: 2048, min: 512 },
        prompt: { default: '' },
        width: { default: 1024, max: 2048, min: 512 },
      },
      parameters: { prompt: '', width: 1024, height: 1024 },
      activeAspectRatio: '1:1',
      isAspectRatioLocked: false,
    });

    render(<DimensionControlGroup />);

    expect(screen.getByLabelText('lock')).toBeInTheDocument();
  });
});
