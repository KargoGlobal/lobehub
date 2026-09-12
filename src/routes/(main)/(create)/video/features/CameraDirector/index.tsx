'use client';

import { Flexbox, Input, InputNumber, TextArea } from '@lobehub/ui';
import { Button, Segmented, Select, Switch, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Clapperboard, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { useVideoStore } from '@/store/video';
import { videoGenerationConfigSelectors } from '@/store/video/selectors';
import { useVideoGenerationConfigParam } from '@/store/video/slices/generationConfig/hooks';

import {
  type AudioMode,
  BACKGROUND_STYLES,
  type BackgroundStyle,
  buildShotsForStyle,
  CAMERA_MOVES,
  CAMERA_SPEEDS,
  type CameraMove,
  type CameraSpeed,
  compilePlan,
  createDefaultPlan,
  DIRECTOR_DURATION_MAX,
  DIRECTOR_DURATION_MIN,
  type DirectorPlan,
  type DirectorTemplate,
  type Framing,
  FRAMINGS,
  MAX_SHOTS,
  type Placement,
  PRODUCT_STYLES,
  type ProductStyle,
  recommendedSettings,
  ROTATION_DEGREES,
  type RotationDegrees,
  type RotationDirection,
  type Shot,
  supportsCameraDirector,
} from './compiler';

const styles = createStaticStyles(({ css, cssVar }) => ({
  column: css`
    flex: 1;
    min-width: 300px;
  `,
  error: css`
    color: ${cssVar.colorError};
  `,
  label: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  ok: css`
    color: ${cssVar.colorSuccess};
  `,
  preview: css`
    overflow: auto;

    max-height: 320px;
    margin: 0;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;

    background: ${cssVar.colorFillQuaternary};
  `,
  shotCard: css`
    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  warning: css`
    color: ${cssVar.colorWarning};
  `,
}));

interface FieldProps {
  children: React.ReactNode;
  label: string;
}

const Field = memo<FieldProps>(({ label, children }) => (
  <Flexbox gap={4}>
    <span className={styles.label}>{label}</span>
    {children}
  </Flexbox>
));

const clampDuration = (value: number | null | undefined, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(DIRECTOR_DURATION_MAX, Math.max(DIRECTOR_DURATION_MIN, Math.round(value)));
};

interface ShotEditorProps {
  canRemove: boolean;
  index: number;
  onChange: (shot: Shot) => void;
  onRemove: () => void;
  range: string;
  shot: Shot;
}

const ShotEditor = memo<ShotEditorProps>(
  ({ shot, index, range, onChange, onRemove, canRemove }) => {
    const { t } = useTranslation('video');

    const cameraOptions = useMemo(
      () => CAMERA_MOVES.map((m) => ({ label: m.label, value: m.id })),
      [],
    );
    const speedOptions = useMemo(() => CAMERA_SPEEDS.map((s) => ({ label: s, value: s })), []);
    const framingOptions = useMemo(() => FRAMINGS.map((f) => ({ label: f, value: f })), []);
    const degreeOptions = useMemo(
      () => ROTATION_DEGREES.map((d) => ({ label: `${d}°`, value: String(d) })),
      [],
    );
    const directionOptions = useMemo(
      () => [
        { label: 'clockwise', value: 'clockwise' },
        { label: 'counter-clockwise', value: 'counter-clockwise' },
      ],
      [],
    );

    return (
      <Flexbox className={styles.shotCard} gap={8}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <Text weight={500}>
            {t('cameraDirector.shots.label')} {index + 1} · {range}
          </Text>
          {canRemove && (
            <Action icon={Trash2} title={t('cameraDirector.shots.remove')} onClick={onRemove} />
          )}
        </Flexbox>
        <Flexbox horizontal gap={8} style={{ flexWrap: 'wrap' }}>
          <Field label={t('cameraDirector.shots.camera')}>
            <Select
              options={cameraOptions}
              style={{ minWidth: 200 }}
              value={shot.camera}
              onChange={(v) => onChange({ ...shot, camera: v as CameraMove })}
            />
          </Field>
          <Field label={t('cameraDirector.shots.speed')}>
            <Select
              options={speedOptions}
              style={{ minWidth: 120 }}
              value={shot.speed}
              onChange={(v) => onChange({ ...shot, speed: v as CameraSpeed })}
            />
          </Field>
          <Field label={t('cameraDirector.shots.framing')}>
            <Select
              options={framingOptions}
              style={{ minWidth: 150 }}
              value={shot.framing}
              onChange={(v) => onChange({ ...shot, framing: v as Framing })}
            />
          </Field>
          {shot.camera === 'orbit' && (
            <>
              <Field label={t('cameraDirector.shots.degrees')}>
                <Select
                  options={degreeOptions}
                  style={{ minWidth: 90 }}
                  value={String(shot.degrees)}
                  onChange={(v) => onChange({ ...shot, degrees: Number(v) as RotationDegrees })}
                />
              </Field>
              <Field label={t('cameraDirector.shots.direction')}>
                <Select
                  options={directionOptions}
                  style={{ minWidth: 150 }}
                  value={shot.direction}
                  onChange={(v) => onChange({ ...shot, direction: v as RotationDirection })}
                />
              </Field>
            </>
          )}
        </Flexbox>
        <Field label={t('cameraDirector.shots.subjectAction')}>
          <TextArea
            autoSize={{ maxRows: 4, minRows: 2 }}
            value={shot.subjectAction}
            onChange={(e) => onChange({ ...shot, subjectAction: e.target.value })}
          />
        </Field>
      </Flexbox>
    );
  },
);

interface CameraDirectorModalProps {
  onClose: () => void;
  open: boolean;
}

const CameraDirectorModal = memo<CameraDirectorModalProps>(({ open, onClose }) => {
  const { t } = useTranslation('video');
  const { allowed: canCreate } = usePermission('create_content');

  const { value: imageUrl } = useVideoGenerationConfigParam('imageUrl');
  const { setValue: setPrompt } = useVideoGenerationConfigParam('prompt');
  const { value: duration, setValue: setDuration } = useVideoGenerationConfigParam('duration');
  const {
    value: resolution,
    setValue: setResolution,
    enumValues: resolutionEnum,
  } = useVideoGenerationConfigParam('resolution');
  const { setValue: setAspectRatio, enumValues: aspectRatioEnum } =
    useVideoGenerationConfigParam('aspectRatio');
  const { setValue: setPromptExtend, enumValues: promptExtendEnum } =
    useVideoGenerationConfigParam('promptExtend');
  const { setValue: setEndImageUrl } = useVideoGenerationConfigParam('endImageUrl');
  const { value: seed } = useVideoGenerationConfigParam('seed');
  const isSupportEndImageUrl = useVideoStore(
    videoGenerationConfigSelectors.isSupportedParam('endImageUrl'),
  );

  const hasStartFrame = Boolean(imageUrl);

  const [plan, setPlan] = useState<DirectorPlan>(() => ({
    ...createDefaultPlan('product3d'),
    duration: clampDuration(duration, 8),
    hasStartFrame,
  }));

  // Keep the plan in sync with the workspace's start frame while the modal is open.
  useEffect(() => {
    setPlan((prev) => (prev.hasStartFrame === hasStartFrame ? prev : { ...prev, hasStartFrame }));
  }, [hasStartFrame]);

  const update = useCallback((patch: Partial<DirectorPlan>) => {
    setPlan((prev) => ({ ...prev, ...patch }));
  }, []);

  const switchTemplate = useCallback((template: DirectorTemplate) => {
    setPlan((prev) => {
      const next = createDefaultPlan(template);
      return {
        ...next,
        duration: prev.duration,
        hasStartFrame: prev.hasStartFrame,
        placement: prev.placement,
        // Carry a user-written description across templates; otherwise use
        // the recipe's own starter subject.
        subject: prev.subject.trim() ? prev.subject : next.subject,
      };
    });
  }, []);

  const switchStyle = useCallback((style: BackgroundStyle | ProductStyle) => {
    setPlan((prev) => ({ ...prev, shots: buildShotsForStyle(prev.template, style), style }));
  }, []);

  const resetShots = useCallback(() => {
    setPlan((prev) => ({ ...prev, shots: buildShotsForStyle(prev.template, prev.style) }));
  }, []);

  const updateShot = useCallback((index: number, shot: Shot) => {
    setPlan((prev) => ({ ...prev, shots: prev.shots.map((s, i) => (i === index ? shot : s)) }));
  }, []);

  const removeShot = useCallback((index: number) => {
    setPlan((prev) => ({ ...prev, shots: prev.shots.filter((_, i) => i !== index) }));
  }, []);

  const addShot = useCallback(() => {
    setPlan((prev) => {
      if (prev.shots.length >= MAX_SHOTS) return prev;
      const hold: Shot = {
        camera: 'static',
        degrees: 360,
        direction: 'clockwise',
        framing: 'medium',
        speed: 'slow',
        subjectAction:
          prev.template === 'product3d'
            ? 'The product holds still, label facing the camera.'
            : 'The form holds still, centred in frame.',
        weight: 1,
      };
      return { ...prev, shots: [...prev.shots, hold] };
    });
  }, []);

  const result = useMemo(() => compilePlan(plan, { resolution, seed }), [plan, resolution, seed]);

  const isProduct = plan.template === 'product3d';
  const styleOptions = useMemo(
    () =>
      (isProduct ? PRODUCT_STYLES : BACKGROUND_STYLES).map((s) => ({
        label: s.label,
        value: s.id,
      })),
    [isProduct],
  );
  const activeStyle = (isProduct ? PRODUCT_STYLES : BACKGROUND_STYLES).find(
    (s) => s.id === plan.style,
  );

  const templateOptions = useMemo(
    () => [
      { label: t('cameraDirector.template.product3d'), value: 'product3d' as DirectorTemplate },
      {
        label: t('cameraDirector.template.background3d'),
        value: 'background3d' as DirectorTemplate,
      },
    ],
    [t],
  );

  const placementOptions = useMemo(
    () => [
      { label: t('cameraDirector.placement.landscape'), value: 'landscape' as Placement },
      { label: t('cameraDirector.placement.vertical'), value: 'vertical' as Placement },
      { label: t('cameraDirector.placement.square'), value: 'square' as Placement },
    ],
    [t],
  );

  const audioOptions = useMemo(
    () => [
      { label: t('cameraDirector.audio.silent'), value: 'silent' as AudioMode },
      { label: t('cameraDirector.audio.ambient'), value: 'ambient' as AudioMode },
    ],
    [t],
  );

  const handleApply = useCallback(() => {
    if (!canCreate || result.errors.length > 0) return;

    const settings = recommendedSettings(plan);
    setPrompt(result.prompt as any);
    setDuration(settings.duration as any);
    if (resolutionEnum?.includes(settings.resolution)) setResolution(settings.resolution as any);
    // image-to-video follows the start frame, so only set aspect for text-to-video.
    if (!hasStartFrame && aspectRatioEnum?.includes(settings.aspectRatio)) {
      setAspectRatio(settings.aspectRatio as any);
    }
    if (promptExtendEnum?.includes(settings.promptExtend)) {
      setPromptExtend(settings.promptExtend as any);
    }
    // A first/last frame pair forces loop closure far more reliably than prose.
    if (plan.seamlessLoop && hasStartFrame && isSupportEndImageUrl) {
      setEndImageUrl(imageUrl as any);
    }

    toast.success({ description: t('cameraDirector.applied'), duration: 2500 });
    onClose();
  }, [
    aspectRatioEnum,
    canCreate,
    hasStartFrame,
    imageUrl,
    isSupportEndImageUrl,
    onClose,
    plan,
    promptExtendEnum,
    resolutionEnum,
    result,
    setAspectRatio,
    setDuration,
    setEndImageUrl,
    setPrompt,
    setPromptExtend,
    setResolution,
    t,
  ]);

  const footer = (
    <Flexbox horizontal gap={8} justify={'flex-end'} padding={12}>
      <Button onClick={onClose}>{t('cameraDirector.cancel')}</Button>
      <Button
        disabled={!canCreate || result.errors.length > 0}
        type={'primary'}
        onClick={handleApply}
      >
        {t('cameraDirector.apply')}
      </Button>
    </Flexbox>
  );

  return (
    <ImperativeModal
      allowFullscreen
      footer={footer}
      open={open}
      title={t('cameraDirector.title')}
      width={960}
      onCancel={onClose}
    >
      <Flexbox gap={16}>
        <Text type={'secondary'}>{t('cameraDirector.subtitle')}</Text>

        <Flexbox horizontal gap={20} style={{ flexWrap: 'wrap' }}>
          {/* ---------------------------------------------------------- left */}
          <Flexbox className={styles.column} gap={12}>
            <Field label={t('cameraDirector.field.template')}>
              <Segmented
                block
                options={templateOptions}
                value={plan.template}
                onChange={(v) => switchTemplate(v as DirectorTemplate)}
              />
            </Field>

            <Field label={t('cameraDirector.field.style')}>
              <Select
                options={styleOptions}
                value={plan.style}
                onChange={(v) => switchStyle(v as BackgroundStyle | ProductStyle)}
              />
              {activeStyle && <span className={styles.label}>{activeStyle.description}</span>}
            </Field>

            <Flexbox horizontal gap={12} style={{ flexWrap: 'wrap' }}>
              <Field label={t('cameraDirector.field.placement')}>
                <Segmented
                  options={placementOptions}
                  value={plan.placement}
                  onChange={(v) => update({ placement: v as Placement })}
                />
              </Field>
              <Field label={t('cameraDirector.field.duration')}>
                <InputNumber
                  max={DIRECTOR_DURATION_MAX}
                  min={DIRECTOR_DURATION_MIN}
                  step={1}
                  style={{ width: 100 }}
                  value={plan.duration}
                  onChange={(v) =>
                    update({ duration: clampDuration(v as number | null, plan.duration) })
                  }
                />
              </Field>
            </Flexbox>

            <Field
              label={isProduct ? t('cameraDirector.field.product') : t('cameraDirector.field.form')}
            >
              <TextArea
                autoSize={{ maxRows: 3, minRows: 1 }}
                value={plan.subject}
                placeholder={
                  isProduct
                    ? t('cameraDirector.field.productPlaceholder')
                    : t('cameraDirector.field.formPlaceholder')
                }
                onChange={(e) => update({ subject: e.target.value })}
              />
            </Field>

            {isProduct && (
              <Field label={t('cameraDirector.field.detail')}>
                <Input
                  placeholder={t('cameraDirector.field.detailPlaceholder')}
                  value={plan.detail}
                  onChange={(e) => update({ detail: e.target.value })}
                />
              </Field>
            )}

            <Field label={t('cameraDirector.field.environment')}>
              <TextArea
                autoSize={{ maxRows: 3, minRows: 1 }}
                value={plan.environment}
                onChange={(e) => update({ environment: e.target.value })}
              />
            </Field>
            <Field label={t('cameraDirector.field.lighting')}>
              <TextArea
                autoSize={{ maxRows: 3, minRows: 1 }}
                value={plan.lighting}
                onChange={(e) => update({ lighting: e.target.value })}
              />
            </Field>
            <Field label={t('cameraDirector.field.palette')}>
              <TextArea
                autoSize={{ maxRows: 3, minRows: 1 }}
                value={plan.palette}
                onChange={(e) => update({ palette: e.target.value })}
              />
            </Field>

            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <Text weight={500}>{t('cameraDirector.field.seamlessLoop')}</Text>
              <Switch
                checked={plan.seamlessLoop}
                onChange={(checked) => update({ seamlessLoop: checked })}
              />
            </Flexbox>
            {!isProduct && (
              <Flexbox horizontal align={'center'} justify={'space-between'}>
                <Text weight={500}>{t('cameraDirector.field.copySafeZone')}</Text>
                <Switch
                  checked={plan.copySafeZone}
                  onChange={(checked) => update({ copySafeZone: checked })}
                />
              </Flexbox>
            )}
            <Field label={t('cameraDirector.field.audio')}>
              <Segmented
                options={audioOptions}
                value={plan.audio}
                onChange={(v) => update({ audio: v as AudioMode })}
              />
            </Field>
          </Flexbox>

          {/* --------------------------------------------------------- right */}
          <Flexbox className={styles.column} gap={12}>
            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <Text weight={500}>{t('cameraDirector.shots.title')}</Text>
              <Flexbox horizontal gap={4}>
                <Action
                  icon={RotateCcw}
                  title={t('cameraDirector.shots.reset')}
                  onClick={resetShots}
                />
                <Action
                  disabled={plan.shots.length >= MAX_SHOTS}
                  icon={Plus}
                  title={t('cameraDirector.shots.add')}
                  onClick={addShot}
                />
              </Flexbox>
            </Flexbox>
            {plan.shots.map((shot, index) => {
              const timed = result.timeline[index];
              return (
                <ShotEditor
                  canRemove={plan.shots.length > 1}
                  index={index}
                  key={index}
                  range={timed ? `${timed.start}–${timed.end}s` : ''}
                  shot={shot}
                  onChange={(next) => updateShot(index, next)}
                  onRemove={() => removeShot(index)}
                />
              );
            })}

            <Text weight={500}>{t('cameraDirector.qa.title')}</Text>
            <Flexbox gap={4}>
              {result.errors.map((e) => (
                <span className={styles.error} key={e}>
                  ✕ {e}
                </span>
              ))}
              {result.warnings.map((w) => (
                <span className={styles.warning} key={w}>
                  ⚠ {w}
                </span>
              ))}
              {result.errors.length === 0 && result.warnings.length === 0 && (
                <span className={styles.ok}>✓ {t('cameraDirector.qa.pass')}</span>
              )}
            </Flexbox>

            <Text weight={500}>{t('cameraDirector.preview.title')}</Text>
            <pre className={styles.preview}>{result.prompt}</pre>
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </ImperativeModal>
  );
});

/**
 * Toolbar entry point. Rendered only when the selected model understands the
 * Director's prompt grammar (MiniMax H3 family).
 */
const CameraDirectorAction = memo(() => {
  const { t } = useTranslation('video');
  const [open, setOpen] = useState(false);
  const model = useVideoStore(videoGenerationConfigSelectors.model);

  if (!supportsCameraDirector(model)) return null;

  return (
    <>
      <Action icon={Clapperboard} title={t('cameraDirector.title')} onClick={() => setOpen(true)} />
      {open && <CameraDirectorModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
});

CameraDirectorAction.displayName = 'CameraDirectorAction';

export default CameraDirectorAction;
