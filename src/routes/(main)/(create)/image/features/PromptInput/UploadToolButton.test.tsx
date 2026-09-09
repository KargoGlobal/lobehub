import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useFileStore } from '@/store/file';
import { useImageStore } from '@/store/image';

import UploadToolButton from './UploadToolButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop(),
  }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

describe('UploadToolButton', () => {
  it('uploads a file then runs the chosen tool against the uploaded url', async () => {
    const createUtilityImage = vi.fn().mockResolvedValue(undefined);
    const uploadWithProgress = vi
      .fn()
      .mockResolvedValue({ url: 'https://example.com/uploaded.jpg' });
    useImageStore.setState({ createUtilityImage: createUtilityImage as any });
    useFileStore.setState({ uploadWithProgress: uploadWithProgress as any });
    const user = userEvent.setup();

    render(<UploadToolButton />);

    const file = new File(['(binary)'], 'photo.png', { type: 'image/png' });
    const input = screen.getByTestId('upload-tool-input');
    await user.upload(input as HTMLInputElement, file);

    await waitFor(() => screen.getByLabelText('removeBackground'));
    await user.click(screen.getByLabelText('removeBackground'));

    expect(uploadWithProgress).toHaveBeenCalledTimes(1);
    expect(createUtilityImage).toHaveBeenCalledWith(
      'https://example.com/uploaded.jpg',
      'removeBackground',
    );
  });

  it('shows no tool buttons before an image is uploaded', () => {
    render(<UploadToolButton />);

    expect(screen.queryByLabelText('removeBackground')).toBeNull();
    expect(screen.queryByLabelText('upscale')).toBeNull();
  });
});
