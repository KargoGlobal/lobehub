'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon } from '@lobehub/ui/base-ui';
import { Eraser, Sparkles, Upload, X } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';
import {
  type ReferenceUploadSlot,
  useReferenceImageUpload,
} from '@/routes/(main)/(create)/features/GenerationInput/useReferenceImageUpload';
import ImageEditToolButton from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/ImageEditToolButton';
import { useImageStore } from '@/store/image';
import { type UtilityTool } from '@/store/image/slices/createImage/action';

/**
 * Upload-and-run entry point for the utility tools (background removal /
 * upscale) so designers can process external images, not just generated ones.
 *
 * Deliberately NOT built on the page's `useImageReferenceUpload()` wrapper:
 * that wrapper reads/writes the currently-selected model's `imageUrl` config
 * param, which is wrong here — these tools are never the selected model. The
 * uploaded url lives in local component state instead.
 */
const UploadToolButton = memo(() => {
  const { t } = useTranslation('image');
  const { allowed: canCreate } = usePermission('create_content');
  const createUtilityImage = useImageStore((s) => s.createUtilityImage);
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadingPreviews, setUploadingPreviews] = useState<string[]>([]);

  const slot: ReferenceUploadSlot = {
    capacity: 1,
    getCurrentValues: () => (uploadedUrl ? [uploadedUrl] : []),
    set: (urls) => setUploadedUrl(urls[0] ?? null),
    values: uploadedUrl ? [uploadedUrl] : [],
  };

  const { handleUploadFiles } = useReferenceImageUpload({
    addUploadingPreviews: (urls) => setUploadingPreviews((prev) => [...prev, ...urls]),
    canCreate,
    removeUploadingPreviews: (urls) =>
      setUploadingPreviews((prev) => prev.filter((u) => !urls.includes(u))),
    slots: [slot],
    uploadingPreviews,
  });

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (files.length === 0) return;
      await handleUploadFiles(files);
    },
    [handleUploadFiles],
  );

  const runTool = useCallback(
    async (tool: UtilityTool) => {
      if (!uploadedUrl) return;
      await createUtilityImage(uploadedUrl, tool);
      setUploadedUrl(null);
    },
    [createUtilityImage, uploadedUrl],
  );

  const isUploading = uploadingPreviews.length > 0;

  return (
    <Flexbox horizontal align={'center'} gap={2}>
      <input
        accept="image/*"
        data-testid="upload-tool-input"
        ref={inputRef}
        style={{ display: 'none' }}
        type="file"
        onChange={handleFileChange}
      />
      <ActionIcon
        aria-label={t('tools.upload')}
        disabled={!canCreate}
        icon={Upload}
        loading={isUploading}
        size={{ blockSize: 36, size: 20 }}
        title={t('tools.upload')}
        onClick={() => inputRef.current?.click()}
      />
      {uploadedUrl && (
        <>
          <img
            alt={t('tools.upload')}
            src={uploadedUrl}
            style={{ borderRadius: 4, height: 28, objectFit: 'cover', width: 28 }}
          />
          <ActionIcon
            aria-label={t('generation.actions.removeBackground')}
            icon={Eraser}
            size={{ blockSize: 36, size: 20 }}
            title={t('generation.actions.removeBackground')}
            onClick={() => runTool('removeBackground')}
          />
          <ActionIcon
            aria-label={t('generation.actions.upscale')}
            icon={Sparkles}
            size={{ blockSize: 36, size: 20 }}
            title={t('generation.actions.upscale')}
            onClick={() => runTool('upscale')}
          />
          <ImageEditToolButton sourceUrl={uploadedUrl} onApplied={() => setUploadedUrl(null)} />
          <ActionIcon
            aria-label={t('tools.clear')}
            icon={X}
            size={{ blockSize: 36, size: 20 }}
            title={t('tools.clear')}
            onClick={() => setUploadedUrl(null)}
          />
        </>
      )}
    </Flexbox>
  );
});

UploadToolButton.displayName = 'UploadToolButton';

export default UploadToolButton;
