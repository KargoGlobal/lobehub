'use client';

import { Flexbox, Input, TextArea } from '@lobehub/ui';
import { Button, Segmented, Select, toast } from '@lobehub/ui/base-ui';
import { Wand2 } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { useImageStore } from '@/store/image';

type Mode = 'place' | 'relight' | 'resize';

/**
 * `fal-ai/image-editing/reframe` only accepts these nine ratios — presenting
 * anything finer (an exact IAB or Kargo pixel size) would promise precision
 * the endpoint can't deliver. Exact-pixel export is tracked separately.
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
 * One popover covering the three Version-1 edit tools (resize, product
 * placement, relight) instead of three separate icons — each needs exactly
 * one text/select input, so a shared small form is simpler than three
 * bespoke popovers and matches the Segmented-recipe pattern used elsewhere.
 */
const ImageEditToolButton = memo<ImageEditToolButtonProps>(({ sourceUrl, onApplied }) => {
  const { t } = useTranslation('image');
  const { allowed: canCreate } = usePermission('create_content');
  const createEditedImage = useImageStore((s) => s.createEditedImage);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('resize');
  const [ratio, setRatio] = useState<(typeof RESIZE_RATIOS)[number]['value']>('16:9');
  const [sceneText, setSceneText] = useState('');
  const [relightText, setRelightText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ratioOptions = useMemo(
    () => RESIZE_RATIOS.map((r) => ({ label: t(r.label as any), value: r.value })),
    [t],
  );

  const canApply =
    canCreate &&
    (mode === 'resize' ||
      (mode === 'place' && sceneText.trim().length > 0) ||
      (mode === 'relight' && relightText.trim().length > 0));

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
      } else {
        const description = relightText.trim();
        await createEditedImage(sourceUrl, {
          model: 'fal-ai/iclight-v2',
          params: { prompt: description },
        });
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
  }, [canApply, createEditedImage, mode, onApplied, ratio, relightText, sceneText, sourceUrl, t]);

  const modeOptions = useMemo(
    () => [
      { label: t('editTool.mode.resize'), value: 'resize' as Mode },
      { label: t('editTool.mode.place'), value: 'place' as Mode },
      { label: t('editTool.mode.relight'), value: 'relight' as Mode },
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
