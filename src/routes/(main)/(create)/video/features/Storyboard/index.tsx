'use client';

import { Flexbox, Input, InputNumber, TextArea } from '@lobehub/ui';
import { Button, Segmented, Select, Switch, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { ArrowDown, ArrowUp, ListVideo, Plus, Trash2 } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { compileBrandPreamble, useBrandKits } from '@/features/BrandKit';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { useVideoStore } from '@/store/video';
import { createVideoSelectors, videoGenerationConfigSelectors } from '@/store/video/selectors';
import { useVideoGenerationConfigParam } from '@/store/video/slices/generationConfig/hooks';
import { generateUniqueSeeds } from '@/utils/number';

import {
  CAMERA_MOVES,
  CAMERA_SPEEDS,
  type CameraMove,
  type CameraSpeed,
  DIRECTOR_DURATION_MAX,
  DIRECTOR_DURATION_MIN,
  type DirectorTemplate,
  type Framing,
  FRAMINGS,
  type Placement,
  type ReferenceMode,
  ROTATION_DEGREES,
  type RotationDegrees,
  type RotationDirection,
} from '../CameraDirector/compiler';
import {
  compileStoryboard,
  createDefaultStoryboardPlan,
  createStoryboardShot,
  MAX_STORYBOARD_SHOTS,
  MIN_STORYBOARD_SHOTS,
  reorderShots,
  STORYBOARD_MODELS,
  type StoryboardPlan,
  type StoryboardShot,
} from './storyboard';

const FAL_PROVIDER = 'fal';

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
  shotCard: css`
    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  summaryBar: css`
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillTertiary};
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

interface ShotEditorProps {
  canRemove: boolean;
  duration: number;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (shot: StoryboardShot) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
  shot: StoryboardShot;
  total: number;
}

const ShotEditor = memo<ShotEditorProps>(
  ({
    shot,
    index,
    total,
    duration,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
    canRemove,
    isFirst,
    isLast,
  }) => {
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
            {t('storyboard.shots.label')} {index + 1} {t('storyboard.shots.of')} {total} ·{' '}
            {duration}s
          </Text>
          <Flexbox horizontal gap={4}>
            <Action
              disabled={isFirst}
              icon={ArrowUp}
              title={t('storyboard.shots.moveUp')}
              onClick={onMoveUp}
            />
            <Action
              disabled={isLast}
              icon={ArrowDown}
              title={t('storyboard.shots.moveDown')}
              onClick={onMoveDown}
            />
            {canRemove && (
              <Action icon={Trash2} title={t('storyboard.shots.remove')} onClick={onRemove} />
            )}
          </Flexbox>
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
          <Field label={t('cameraDirector.field.duration')}>
            <InputNumber
              max={DIRECTOR_DURATION_MAX}
              min={DIRECTOR_DURATION_MIN}
              step={1}
              style={{ width: 100 }}
              value={shot.duration}
              onChange={(v) =>
                onChange({ ...shot, duration: typeof v === 'number' ? v : shot.duration })
              }
            />
          </Field>
        </Flexbox>
        <Field label={t('cameraDirector.shots.subjectAction')}>
          <TextArea
            autoSize={{ maxRows: 4, minRows: 2 }}
            value={shot.subjectAction}
            onChange={(e) => onChange({ ...shot, subjectAction: e.target.value })}
          />
        </Field>
        <Field label={t('storyboard.shots.narrative')}>
          <TextArea
            autoSize={{ maxRows: 3, minRows: 1 }}
            placeholder={t('storyboard.shots.narrativePlaceholder')}
            value={shot.narrative}
            onChange={(e) => onChange({ ...shot, narrative: e.target.value })}
          />
        </Field>
      </Flexbox>
    );
  },
);

interface StoryboardModalProps {
  onClose: () => void;
  open: boolean;
}

const StoryboardModal = memo<StoryboardModalProps>(({ open, onClose }) => {
  const { t } = useTranslation('video');
  const { allowed: canCreate } = usePermission('create_content');
  const { value: imageUrl } = useVideoGenerationConfigParam('imageUrl');
  const isSupportImageUrl = useVideoStore(
    videoGenerationConfigSelectors.isSupportedParam('imageUrl'),
  );
  const createVideosFromRequests = useVideoStore((s) => s.createVideosFromRequests);
  const isCreating = useVideoStore(createVideoSelectors.isCreating);
  const { activeKit } = useBrandKits();
  const brand = useMemo(() => compileBrandPreamble(activeKit, 'video'), [activeKit]);

  const hasStartFrame = Boolean(imageUrl);

  const [plan, setPlan] = useState<StoryboardPlan>(() => ({
    ...createDefaultStoryboardPlan('product3d'),
    hasStartFrame,
  }));
  const [seeds] = useState(() => generateUniqueSeeds(MAX_STORYBOARD_SHOTS));

  const update = useCallback((patch: Partial<StoryboardPlan>) => {
    setPlan((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateShot = useCallback((index: number, shot: StoryboardShot) => {
    setPlan((prev) => ({ ...prev, shots: prev.shots.map((s, i) => (i === index ? shot : s)) }));
  }, []);

  const removeShot = useCallback((index: number) => {
    setPlan((prev) => ({ ...prev, shots: prev.shots.filter((_, i) => i !== index) }));
  }, []);

  const addShot = useCallback(() => {
    setPlan((prev) => {
      if (prev.shots.length >= MAX_STORYBOARD_SHOTS) return prev;
      return {
        ...prev,
        shots: [...prev.shots, createStoryboardShot(prev.template, prev.shots.length)],
      };
    });
  }, []);

  const moveShot = useCallback((from: number, to: number) => {
    setPlan((prev) => ({ ...prev, shots: reorderShots(prev.shots, from, to) }));
  }, []);

  const result = useMemo(
    () =>
      compileStoryboard(
        { ...plan, hasStartFrame },
        { brand, imageUrl, seeds: plan.shots.map((_, i) => seeds[i] ?? null) },
      ),
    [brand, hasStartFrame, imageUrl, plan, seeds],
  );

  const isOnModel = plan.template === 'onModel';
  const isBackground = plan.template === 'background3d';

  const templateOptions = useMemo(
    () => [
      { label: t('cameraDirector.template.product3d'), value: 'product3d' as DirectorTemplate },
      { label: t('cameraDirector.template.onModel'), value: 'onModel' as DirectorTemplate },
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

  const referenceModeOptions = useMemo(
    () => [
      { label: t('storyboard.referenceMode.startFrame'), value: 'startFrame' as ReferenceMode },
      { label: t('storyboard.referenceMode.reference'), value: 'reference' as ReferenceMode },
    ],
    [t],
  );

  const handleGenerate = useCallback(async () => {
    if (!canCreate || result.errors.length > 0) return;
    try {
      await createVideosFromRequests(result.shots.map((s) => s.request));
      toast.success({
        description: t('storyboard.started', { count: result.shots.length }),
        duration: 3000,
      });
      onClose();
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : String(error),
        duration: 5000,
      });
    }
  }, [canCreate, createVideosFromRequests, onClose, result, t]);

  const footer = (
    <Flexbox horizontal align={'center'} gap={8} justify={'space-between'} padding={12}>
      <span className={styles.label}>
        {t('storyboard.totalSummary', {
          cost: `$${result.totalCost.toFixed(2)}`,
          duration: String(result.totalDuration),
          shots: String(result.shots.length),
        })}
      </span>
      <Flexbox horizontal gap={8}>
        <Button onClick={onClose}>{t('cameraDirector.cancel')}</Button>
        <Button
          disabled={!canCreate || result.errors.length > 0}
          loading={isCreating}
          type={'primary'}
          onClick={handleGenerate}
        >
          {t('storyboard.generate', { count: result.shots.length })}
        </Button>
      </Flexbox>
    </Flexbox>
  );

  return (
    <ImperativeModal
      allowFullscreen
      footer={footer}
      open={open}
      title={t('storyboard.title')}
      width={1000}
      onCancel={onClose}
    >
      <Flexbox gap={16}>
        <Text type={'secondary'}>{t('storyboard.subtitle')}</Text>

        <Flexbox horizontal gap={20} style={{ flexWrap: 'wrap' }}>
          {/* ---------------------------------------------------------- left */}
          <Flexbox className={styles.column} gap={12}>
            <Field label={t('cameraDirector.field.template')}>
              <Segmented
                block
                options={templateOptions}
                value={plan.template}
                onChange={(v) => {
                  const template = v as StoryboardPlan['template'];
                  setPlan((prev) => ({
                    ...prev,
                    shots: prev.shots.map((_, i) => createStoryboardShot(template, i)),
                    template,
                  }));
                }}
              />
            </Field>

            <Field
              label={
                isBackground ? t('cameraDirector.field.form') : t('cameraDirector.field.product')
              }
            >
              <TextArea
                autoSize={{ maxRows: 3, minRows: 1 }}
                value={plan.subject}
                placeholder={
                  isBackground
                    ? t('cameraDirector.field.formPlaceholder')
                    : t('cameraDirector.field.productPlaceholder')
                }
                onChange={(e) => update({ subject: e.target.value })}
              />
            </Field>

            {isOnModel && (
              <Field label={t('cameraDirector.field.talent')}>
                <Input
                  placeholder={t('cameraDirector.field.talentPlaceholder')}
                  value={plan.talent}
                  onChange={(e) => update({ talent: e.target.value })}
                />
              </Field>
            )}

            {!isBackground && (
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

            <Flexbox horizontal gap={12} style={{ flexWrap: 'wrap' }}>
              <Field label={t('cameraDirector.field.placement')}>
                <Segmented
                  options={placementOptions}
                  value={plan.placement}
                  onChange={(v) => update({ placement: v as Placement })}
                />
              </Field>
            </Flexbox>

            {hasStartFrame && (
              <Field label={t('storyboard.referenceMode.label')}>
                <Segmented
                  options={referenceModeOptions}
                  value={plan.referenceMode ?? 'startFrame'}
                  onChange={(v) => update({ referenceMode: v as ReferenceMode })}
                />
              </Field>
            )}
            {!hasStartFrame && isSupportImageUrl && (
              <span className={styles.label}>{t('storyboard.noPhoto')}</span>
            )}
            {hasStartFrame && <span className={styles.label}>{t('storyboard.usingPhoto')}</span>}

            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <Text weight={500}>{t('cameraDirector.field.audio')}</Text>
              <Switch
                checked={plan.audio === 'ambient'}
                onChange={(checked) => update({ audio: checked ? 'ambient' : 'silent' })}
              />
            </Flexbox>
          </Flexbox>

          {/* --------------------------------------------------------- right */}
          <Flexbox className={styles.column} gap={12}>
            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <Text weight={500}>{t('storyboard.shots.title')}</Text>
              <Action
                disabled={plan.shots.length >= MAX_STORYBOARD_SHOTS}
                icon={Plus}
                title={t('storyboard.shots.add')}
                onClick={addShot}
              />
            </Flexbox>

            {plan.shots.map((shot, index) => (
              <ShotEditor
                canRemove={plan.shots.length > MIN_STORYBOARD_SHOTS}
                duration={result.shots[index]?.duration ?? shot.duration}
                index={index}
                isFirst={index === 0}
                isLast={index === plan.shots.length - 1}
                key={index}
                shot={shot}
                total={plan.shots.length}
                onChange={(next) => updateShot(index, next)}
                onMoveDown={() => moveShot(index, index + 1)}
                onMoveUp={() => moveShot(index, index - 1)}
                onRemove={() => removeShot(index)}
              />
            ))}

            <Flexbox
              horizontal
              align={'center'}
              className={styles.summaryBar}
              justify={'space-between'}
            >
              <Text weight={500}>
                {t('storyboard.totalSummary', {
                  cost: `$${result.totalCost.toFixed(2)}`,
                  duration: String(result.totalDuration),
                  shots: String(result.shots.length),
                })}
              </Text>
            </Flexbox>

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
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </ImperativeModal>
  );
});

/**
 * Whether the fal provider exposes the H3 Max model this tool targets —
 * independent of which model is selected, the same gating Auto-animate uses,
 * since both tools submit their own explicit model/provider requests rather
 * than using the toolbar's selected model. Exported so the Tools menu can
 * show the entry disabled-with-reason instead of hiding it.
 */
export const useStoryboardAvailability = (): boolean => {
  const enabledVideoModelList = useAiInfraStore(aiProviderSelectors.enabledVideoModelList);

  return useMemo(() => {
    const fal = enabledVideoModelList.find((p) => p.id === FAL_PROVIDER);
    if (!fal) return false;
    const ids = new Set(fal.children.map((m) => m.id));
    return ids.has(STORYBOARD_MODELS.startFrame);
  }, [enabledVideoModelList]);
};

interface StoryboardActionProps {
  /** Controlled open state (used by the Tools menu); uncontrolled by default. */
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  /** Render the bare toolbar icon trigger. Set false when a menu opens this tool instead. @default true */
  renderTrigger?: boolean;
}

/**
 * Toolbar entry point. Shown whenever the fal provider exposes the H3 Max
 * model this tool targets — independent of which model is selected, the same
 * gating Auto-animate uses, since both tools submit their own explicit
 * model/provider requests rather than using the toolbar's selected model.
 */
const StoryboardAction = memo<StoryboardActionProps>(
  ({ open: openProp, onOpenChange, renderTrigger = true }) => {
    const { t } = useTranslation('video');
    const [internalOpen, setInternalOpen] = useState(false);
    const available = useStoryboardAvailability();

    const open = openProp ?? internalOpen;
    const setOpen = useCallback(
      (next: boolean) => {
        setInternalOpen(next);
        onOpenChange?.(next);
      },
      [onOpenChange],
    );

    if (renderTrigger && !available) return null;

    return (
      <>
        {renderTrigger && (
          <Action icon={ListVideo} title={t('storyboard.title')} onClick={() => setOpen(true)} />
        )}
        {open && <StoryboardModal open={open} onClose={() => setOpen(false)} />}
      </>
    );
  },
);

StoryboardAction.displayName = 'StoryboardAction';

export default StoryboardAction;
