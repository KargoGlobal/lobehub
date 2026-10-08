import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadFile } from './downloadFile';

describe('downloadFile', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();
    fetchMock.mockResolvedValue({ blob: async () => new Blob(['x']), ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  // Regression: `credentials: 'omit'` dropped the session cookie on same-origin
  // `/f/:id` proxy URLs, so host-level auth redirected to a login page and the
  // download failed with a CORS error.
  it('sends same-origin credentials so the file proxy can be authenticated', async () => {
    await downloadFile('/f/file_123', 'image.png', false);

    expect(fetchMock).toHaveBeenCalledWith(
      '/f/file_123',
      expect.objectContaining({ credentials: 'same-origin', mode: 'cors' }),
    );
  });

  it('rethrows when fallback is disabled and the fetch fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(downloadFile('/f/file_123', 'image.png', false)).rejects.toThrow(
      'Failed to fetch',
    );
  });
});
