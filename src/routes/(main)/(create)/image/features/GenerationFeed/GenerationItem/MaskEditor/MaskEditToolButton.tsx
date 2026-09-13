'use client';

import { Flexbox, TextArea } from '@lobehub/ui';
import { Button, Segmented, SliderWithInput, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Brush, Eraser, Undo2 } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { useFileStore } from '@/store/file';
import { useImageStore } from '@/store/image';

import {
  BRUSH_DEFAULT,
  BRUSH_MAX,
  BRUSH_MIN,
  buildEraseRequest,
  buildReplaceRequest,
  drawStroke,
  hasStrokes,
  type MaskMode,
  PREVIEW_STROKE_COLOR,
  rasterizeMask,
  type Size,
  type Stroke,
  toNatural,
} from './mask';

const styles = createStaticStyles(({ css, cssVar }) => ({
  canvas: css`
    touch-action: none;
    cursor: crosshair;

    position: absolute;
    inset: 0;

    width: 100%;
    height: 100%;
  `,
  hint: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  img: css`
    pointer-events: none;
    user-select: none;

    display: block;

    width: 100%;
    height: auto;
  `,
  stage: css`
    position: relative;

    overflow: hidden;

    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
}));

/** Renders the translucent stroke preview onto the overlay canvas. */
const paintPreview = (canvas: HTMLCanvasElement | null, strokes: Stroke[], natural: Size) => {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  if (canvas.width !== natural.width || canvas.height !== natural.height) {
    canvas.width = natural.width;
    canvas.height = natural.height;
  }
  ctx.clearRect(0, 0, natural.width, natural.height);
  for (const stroke of strokes) drawStroke(ctx, stroke, PREVIEW_STROKE_COLOR);
};

/** Rasterise the mask to a PNG blob at natural size (black bg, white strokes). */
const exportMask = (strokes: Stroke[], natural: Size): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const off = document.createElement('canvas');
    off.width = natural.width;
    off.height = natural.height;
    const ctx = off.getContext('2d');
    if (!ctx) {
      reject(new Error('2D canvas context unavailable'));
      return;
    }
    rasterizeMask(ctx, strokes, natural);
    off.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode mask'));
    }, 'image/png');
  });

interface MaskEditorModalProps {
  onApplied?: () => void;
  onClose: () => void;
  open: boolean;
  sourceUrl: string;
}

const MaskEditorModal = memo<MaskEditorModalProps>(({ open, onClose, sourceUrl, onApplied }) => {
  const { t } = useTranslation('image');
  const { allowed: canCreate } = usePermission('create_content');
  const createEditedImage = useImageStore((s) => s.createEditedImage);
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [mode, setMode] = useState<MaskMode>('erase');
  const [brush, setBrush] = useState(BRUSH_DEFAULT);
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const drawing = useRef(false);

  useEffect(() => {
    if (natural) paintPreview(canvasRef.current, strokes, natural);
  }, [strokes, natural]);

  const pointFromEvent = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!natural) return null;
      const rect = e.currentTarget.getBoundingClientRect();
      return toNatural(e.clientX, e.clientY, rect, natural);
    },
    [natural],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const p = pointFromEvent(e);
      if (!p) return;
      drawing.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setStrokes((prev) => [...prev, { points: [p], size: brush }]);
    },
    [brush, pointFromEvent],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;
      const p = pointFromEvent(e);
      if (!p) return;
      setStrokes((prev) => {
        if (prev.length === 0) return prev;
        const last = prev.at(-1)!;
        return [...prev.slice(0, -1), { ...last, points: [...last.points, p] }];
      });
    },
    [pointFromEvent],
  );

  const onPointerUp = useCallback(() => {
    drawing.current = false;
  }, []);

  const undo = useCallback(() => setStrokes((prev) => prev.slice(0, -1)), []);
  const clear = useCallback(() => setStrokes([]), []);

  const canApply =
    canCreate && !!natural && hasStrokes(strokes) && (mode === 'erase' || prompt.trim().length > 0);

  const handleApply = useCallback(async () => {
    if (!canApply || !natural) return;
    setSubmitting(true);
    try {
      const blob = await exportMask(strokes, natural);
      const file = new File([blob], 'mask.png', { type: 'image/png' });
      const uploaded = await uploadWithProgress({
        file,
        onStatusUpdate: () => {},
        skipCheckFileType: true,
      });
      if (!uploaded?.url) throw new Error('Mask upload returned no url');

      const request =
        mode === 'erase'
          ? buildEraseRequest(uploaded.url)
          : buildReplaceRequest(uploaded.url, prompt);
      await createEditedImage(sourceUrl, request);

      toast.success({ description: t('maskEditor.applied'), duration: 2500 });
      onClose();
      onApplied?.();
    } catch (error) {
      console.error('Failed to run mask edit:', error);
      toast.error({ description: t('maskEditor.failed'), duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  }, [
    canApply,
    createEditedImage,
    mode,
    natural,
    onApplied,
    onClose,
    prompt,
    sourceUrl,
    strokes,
    t,
    uploadWithProgress,
  ]);

  const modeOptions = useMemo(
    () => [
      { label: t('maskEditor.mode.erase'), value: 'erase' as MaskMode },
      { label: t('maskEditor.mode.replace'), value: 'replace' as MaskMode },
    ],
    [t],
  );

  const footer = (
    <Flexbox horizontal align={'center'} gap={8} justify={'space-between'} padding={12}>
      <span className={styles.hint}>
        {mode === 'erase' ? t('maskEditor.hint.erase') : t('maskEditor.hint.replace')}
      </span>
      <Flexbox horizontal gap={8}>
        <Button onClick={onClose}>{t('maskEditor.cancel')}</Button>
        <Button disabled={!canApply} loading={submitting} type={'primary'} onClick={handleApply}>
          {t('maskEditor.apply')}
        </Button>
      </Flexbox>
    </Flexbox>
  );

  return (
    <ImperativeModal
      allowFullscreen
      footer={footer}
      open={open}
      title={t('maskEditor.title')}
      width={880}
      onCancel={onClose}
    >
      <Flexbox gap={14}>
        <Text type={'secondary'}>{t('maskEditor.subtitle')}</Text>

        <Flexbox horizontal align={'center'} gap={12} style={{ flexWrap: 'wrap' }}>
          <Segmented options={modeOptions} value={mode} onChange={(v) => setMode(v as MaskMode)} />
          <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 260 }}>
            <span className={styles.hint}>{t('maskEditor.brush')}</span>
            <SliderWithInput
              max={BRUSH_MAX}
              min={BRUSH_MIN}
              step={2}
              style={{ flex: 1 }}
              value={brush}
              onChange={(v) => setBrush(Number(v))}
            />
          </Flexbox>
          <Flexbox horizontal gap={4}>
            <Button
              disabled={strokes.length === 0}
              icon={<Undo2 size={14} />}
              size={'small'}
              onClick={undo}
            >
              {t('maskEditor.undo')}
            </Button>
            <Button
              disabled={strokes.length === 0}
              icon={<Eraser size={14} />}
              size={'small'}
              onClick={clear}
            >
              {t('maskEditor.clear')}
            </Button>
          </Flexbox>
        </Flexbox>

        <div className={styles.stage}>
          <img
            alt={t('maskEditor.title')}
            className={styles.img}
            data-testid={'mask-editor-image'}
            src={sourceUrl}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setNatural({ height: img.naturalHeight, width: img.naturalWidth });
              }
            }}
          />
          <canvas
            aria-label={t('maskEditor.canvasLabel')}
            className={styles.canvas}
            data-testid={'mask-editor-canvas'}
            ref={canvasRef}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerLeave={onPointerUp}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>

        {mode === 'replace' && (
          <Flexbox gap={4}>
            <span className={styles.hint}>{t('maskEditor.promptLabel')}</span>
            <TextArea
              autoSize={{ maxRows: 3, minRows: 1 }}
              placeholder={t('maskEditor.promptPlaceholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Flexbox>
        )}
      </Flexbox>
    </ImperativeModal>
  );
});

interface MaskEditToolButtonProps {
  onApplied?: () => void;
  sourceUrl: string;
}

/** Toolbar entry point: paint a mask, then erase it or replace it from a prompt. */
const MaskEditToolButton = memo<MaskEditToolButtonProps>(({ sourceUrl, onApplied }) => {
  const { t } = useTranslation('image');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Action icon={Brush} title={t('maskEditor.title')} onClick={() => setOpen(true)} />
      {open && (
        <MaskEditorModal
          open={open}
          sourceUrl={sourceUrl}
          onApplied={onApplied}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
});

MaskEditToolButton.displayName = 'MaskEditToolButton';

export default MaskEditToolButton;
