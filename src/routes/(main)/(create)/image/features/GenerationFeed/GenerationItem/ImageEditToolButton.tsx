'use client';

import { Flexbox, Input, TextArea } from '@lobehub/ui';
import { Button, Segmented, Select, toast } from '@lobehub/ui/base-ui';
import { Upload, Wand2, X } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { useFileStore } from '@/store/file';
import { useImageStore } from '@/store/image';

import { buildTryOnRequest, TRY_ON_CATEGORIES, type TryOnCategory } from './MaskEditor/mask';

type Mode = 'place' | 'relight' | 'resize' | 'tryon' | 'typography';

type TypographyStyle = 'photo' | 'vector';
type TypographyQuality = 'TURBO' | 'BALANCED' | 'QUALITY';

const TYPOGRAPHY_QUALITIES: TypographyQuality[] = ['TURBO', 'BALANCED', 'QUALITY'];

/**
 * `fal-ai/image-editing/reframe` only accepts these nine ratios — presenting
 * anything finer (an exact IAB or brand-specific pixel size) would promise
 * precision the endpoint can't deliver. Exact-pixel export is tracked separately.
 */
const RESIZE_RATIOS = [
  { label: 'editTool.resize.ratio.21:9', value: '21:9' },
  { label: 'editTool.resize.ratio.16:9', value: '16:9' },
  { label: 'editTool.resize.ratio.4:3', value: '4:3' },
  { label: 'editTool.resize.ratio.3:2', value: '3:2' },
  { label: 'editTool.resize.ratio.1:1', value: '1:1' },
  { label: 'editTool.resize.ratio.2:3', value: '2:3' },
  { label: 'editTool.resize.ratio.3:4', value: '3:4' },
  { label: 'editTool.resize.ratio.9:16', value: '9:16' },
  { label: 'editTool.resize.ratio.9:21', value: '9:21' },
] as const;

const PLACE_PRESETS = ['presetStudio', 'presetOutdoor', 'presetMarble', 'presetWood'] as const;
const RELIGHT_PRESETS = ['presetSoftbox', 'presetGolden', 'presetSide', 'presetDaylight'] as const;

interface ImageEditToolButtonProps {
  /** Fired after a successful apply — lets callers clear an upload preview. */
  onApplied?: () => void;
  sourceUrl: string;
}

/**
 * One popover covering the single-input edit tools (resize, product
 * placement, relight, try-on, typography) instead of separate icons — each
 * needs one text/select/upload input, so a shared small form is simpler than
 * bespoke popovers and matches the Segmented-recipe pattern used elsewhere.
 * Mask-based edits live in MaskEditToolButton, since painting needs a full
 * modal. Typography is the odd one out: both its models are text-to-image
 * (no `imageUrl` input), so it generates a fresh image around the copy
 * instead of editing `sourceUrl` — see the model comment in `fal.ts`.
 */
const ImageEditToolButton = memo<ImageEditToolButtonProps>(({ sourceUrl, onApplied }) => {
  const { t } = useTranslation('image');
  const { allowed: canCreate } = usePermission('create_content');
  const createEditedImage = useImageStore((s) => s.createEditedImage);
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const modelFileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('resize');
  const [ratio, setRatio] = useState<(typeof RESIZE_RATIOS)[number]['value']>('16:9');
  const [sceneText, setSceneText] = useState('');
  const [relightText, setRelightText] = useState('');
  // Try-on: the source image is the garment; the person photo is uploaded here.
  const [modelImageUrl, setModelImageUrl] = useState<string | null>(null);
  const [modelUploading, setModelUploading] = useState(false);
  const [tryOnCategory, setTryOnCategory] = useState<TryOnCategory>('auto');
  const [typographyHeadline, setTypographyHeadline] = useState('');
  const [typographyDescription, setTypographyDescription] = useState('');
  const [typographyStyle, setTypographyStyle] = useState<TypographyStyle>('photo');
  const [typographyQuality, setTypographyQuality] = useState<TypographyQuality>('BALANCED');
  const [submitting, setSubmitting] = useState(false);

  const handleModelFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !canCreate) return;
      setModelUploading(true);
      try {
        const uploaded = await uploadWithProgress({
          file,
          onStatusUpdate: () => {},
          skipCheckFileType: true,
        });
        if (uploaded?.url) setModelImageUrl(uploaded.url);
      } catch (error) {
        console.error('Failed to upload model photo:', error);
        toast.error({ description: t('editTool.failed'), duration: 4000 });
      } finally {
        setModelUploading(false);
      }
    },
    [canCreate, t, uploadWithProgress],
  );

  const ratioOptions = useMemo(
    () => RESIZE_RATIOS.map((r) => ({ label: t(r.label as any), value: r.value })),
    [t],
  );

  const canApply =
    canCreate &&
    (mode === 'resize' ||
      (mode === 'place' && sceneText.trim().length > 0) ||
      (mode === 'relight' && relightText.trim().length > 0) ||
      (mode === 'tryon' && !!modelImageUrl) ||
      (mode === 'typography' && typographyHeadline.trim().length > 0));

  const handleApply = useCallback(async () => {
    if (!canApply) return;
    setSubmitting(true);
    try {
      if (mode === 'resize') {
        await createEditedImage(sourceUrl, {
          model: 'fal-ai/image-editing/reframe',
          params: { aspectRatio: ratio, prompt: t('editTool.resize.label', { ratio }) },
        });
      } else if (mode === 'place') {
        const description = sceneText.trim();
        await createEditedImage(sourceUrl, {
          model: 'fal-ai/bria/product-shot',
          params: {
            fast: true,
            num_results: 1,
            placement_type: 'automatic',
            prompt: t('editTool.place.promptLabel', { scene: description }),
            scene_description: description,
          },
        });
      } else if (mode === 'relight') {
        const description = relightText.trim();
        await createEditedImage(sourceUrl, {
          model: 'fal-ai/iclight-v2',
          params: { prompt: description },
        });
      } else if (mode === 'typography') {
        const headline = typographyHeadline.trim();
        const description = typographyDescription.trim();
        const prompt = description
          ? t('editTool.typography.promptLabel', { description, headline })
          : t('editTool.typography.promptLabelNoDescription', { headline });
        if (typographyStyle === 'vector') {
          await createEditedImage(sourceUrl, {
            model: 'fal-ai/recraft/v4/pro/text-to-vector',
            params: { prompt },
          });
        } else {
          await createEditedImage(sourceUrl, {
            model: 'ideogram/v4',
            params: { prompt, quality: typographyQuality },
          });
        }
      } else if (modelImageUrl) {
        await createEditedImage(
          sourceUrl,
          buildTryOnRequest(sourceUrl, modelImageUrl, tryOnCategory),
        );
      }
      toast.success({ description: t('editTool.applied'), duration: 2500 });
      setOpen(false);
      onApplied?.();
    } catch (error) {
      console.error('Failed to run image edit tool:', error);
      toast.error({ description: t('editTool.failed'), duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  }, [
    canApply,
    createEditedImage,
    mode,
    modelImageUrl,
    onApplied,
    ratio,
    relightText,
    sceneText,
    sourceUrl,
    t,
    tryOnCategory,
    typographyDescription,
    typographyHeadline,
    typographyQuality,
    typographyStyle,
  ]);

  const categoryOptions = useMemo(
    () =>
      TRY_ON_CATEGORIES.map((c) => ({ label: t(`editTool.tryon.category.${c}` as any), value: c })),
    [t],
  );

  const typographyStyleOptions = useMemo(
    () => [
      { label: t('editTool.typography.style.photo'), value: 'photo' as TypographyStyle },
      { label: t('editTool.typography.style.vector'), value: 'vector' as TypographyStyle },
    ],
    [t],
  );

  const typographyQualityOptions = useMemo(
    () =>
      TYPOGRAPHY_QUALITIES.map((q) => ({
        label: t(`editTool.typography.quality.${q}` as any),
        value: q,
      })),
    [t],
  );

  const modeOptions = useMemo(
    () => [
      { label: t('editTool.mode.resize'), value: 'resize' as Mode },
      { label: t('editTool.mode.place'), value: 'place' as Mode },
      { label: t('editTool.mode.relight'), value: 'relight' as Mode },
      { label: t('editTool.mode.tryon'), value: 'tryon' as Mode },
      { label: t('editTool.mode.typography'), value: 'typography' as Mode },
    ],
    [t],
  );

  return (
    <Action
      icon={Wand2}
      open={open}
      title={t('editTool.title')}
      trigger={'click'}
      popover={{
        content: (
          <Flexbox gap={12} style={{ width: 280 }}>
            <Segmented
              block
              options={modeOptions}
              value={mode}
              onChange={(v) => setMode(v as Mode)}
            />

            {mode === 'resize' && (
              <Flexbox gap={6}>
                <span>{t('editTool.resize.field')}</span>
                <Select
                  options={ratioOptions}
                  value={ratio}
                  onChange={(v) => setRatio(v as typeof ratio)}
                />
                <span style={{ fontSize: 12, opacity: 0.65 }}>{t('editTool.resize.hint')}</span>
              </Flexbox>
            )}

            {mode === 'place' && (
              <Flexbox gap={6}>
                <span>{t('editTool.place.field')}</span>
                <TextArea
                  autoSize={{ maxRows: 4, minRows: 2 }}
                  placeholder={t('editTool.place.placeholder')}
                  value={sceneText}
                  onChange={(e) => setSceneText(e.target.value)}
                />
                <Flexbox horizontal gap={4} style={{ flexWrap: 'wrap' }}>
                  {PLACE_PRESETS.map((key) => (
                    <Button
                      key={key}
                      size={'small'}
                      type={'text'}
                      onClick={() => setSceneText(t(`editTool.place.${key}`))}
                    >
                      {t(`editTool.place.${key}Label`)}
                    </Button>
                  ))}
                </Flexbox>
              </Flexbox>
            )}

            {mode === 'relight' && (
              <Flexbox gap={6}>
                <span>{t('editTool.relight.field')}</span>
                <Input
                  placeholder={t('editTool.relight.placeholder')}
                  value={relightText}
                  onChange={(e) => setRelightText(e.target.value)}
                />
                <Flexbox horizontal gap={4} style={{ flexWrap: 'wrap' }}>
                  {RELIGHT_PRESETS.map((key) => (
                    <Button
                      key={key}
                      size={'small'}
                      type={'text'}
                      onClick={() => setRelightText(t(`editTool.relight.${key}`))}
                    >
                      {t(`editTool.relight.${key}Label`)}
                    </Button>
                  ))}
                </Flexbox>
              </Flexbox>
            )}

            {mode === 'tryon' && (
              <Flexbox gap={6}>
                <span>{t('editTool.tryon.field')}</span>
                <input
                  accept="image/*"
                  data-testid="tryon-model-input"
                  ref={modelFileRef}
                  style={{ display: 'none' }}
                  type="file"
                  onChange={handleModelFile}
                />
                {modelImageUrl ? (
                  <Flexbox horizontal align={'center'} gap={8}>
                    <img
                      alt={t('editTool.tryon.field')}
                      src={modelImageUrl}
                      style={{ borderRadius: 4, height: 48, objectFit: 'cover', width: 48 }}
                    />
                    <Button
                      icon={<X size={14} />}
                      size={'small'}
                      type={'text'}
                      onClick={() => setModelImageUrl(null)}
                    >
                      {t('editTool.tryon.clearModel')}
                    </Button>
                  </Flexbox>
                ) : (
                  <Button
                    disabled={!canCreate}
                    icon={<Upload size={14} />}
                    loading={modelUploading}
                    size={'small'}
                    onClick={() => modelFileRef.current?.click()}
                  >
                    {t('editTool.tryon.upload')}
                  </Button>
                )}
                <span>{t('editTool.tryon.categoryField')}</span>
                <Select
                  options={categoryOptions}
                  value={tryOnCategory}
                  onChange={(v) => setTryOnCategory(v as TryOnCategory)}
                />
                <span style={{ fontSize: 12, opacity: 0.65 }}>{t('editTool.tryon.hint')}</span>
              </Flexbox>
            )}

            {mode === 'typography' && (
              <Flexbox gap={6}>
                <span>{t('editTool.typography.styleField')}</span>
                <Segmented
                  block
                  options={typographyStyleOptions}
                  value={typographyStyle}
                  onChange={(v) => setTypographyStyle(v as TypographyStyle)}
                />
                <span>{t('editTool.typography.field')}</span>
                <Input
                  placeholder={t('editTool.typography.placeholder')}
                  value={typographyHeadline}
                  onChange={(e) => setTypographyHeadline(e.target.value)}
                />
                <span>{t('editTool.typography.descriptionField')}</span>
                <Input
                  placeholder={t('editTool.typography.descriptionPlaceholder')}
                  value={typographyDescription}
                  onChange={(e) => setTypographyDescription(e.target.value)}
                />
                {typographyStyle === 'photo' && (
                  <>
                    <span>{t('editTool.typography.qualityField')}</span>
                    <Select
                      options={typographyQualityOptions}
                      value={typographyQuality}
                      onChange={(v) => setTypographyQuality(v as TypographyQuality)}
                    />
                  </>
                )}
                <span style={{ fontSize: 12, opacity: 0.65 }}>{t('editTool.typography.hint')}</span>
              </Flexbox>
            )}

            <Button
              disabled={!canApply}
              loading={submitting}
              type={'primary'}
              onClick={handleApply}
            >
              {t('editTool.apply')}
            </Button>
          </Flexbox>
        ),
        title: t('editTool.title'),
      }}
      onOpenChange={setOpen}
    />
  );
});

ImageEditToolButton.displayName = 'ImageEditToolButton';

export default ImageEditToolButton;
