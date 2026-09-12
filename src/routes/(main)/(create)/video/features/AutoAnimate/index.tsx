'use client';

import { Flexbox, TextArea } from '@lobehub/ui';
import { Button, Segmented, Select, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { Sparkles } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { useVideoStore } from '@/store/video';
import { createVideoSelectors } from '@/store/video/selectors';
import { useVideoGenerationConfigParam } from '@/store/video/slices/generationConfig/hooks';
import { generateUniqueSeeds } from '@/utils/number';

import { type Placement } from '../CameraDirector/compiler';
import {
  type AnimationConcept,
  AUTO_ANIMATE_MODELS,
  buildConcepts,
  detectCategory,
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from './catalog';

const FAL_PROVIDER = 'fal';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    cursor: pointer;

    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    background: ${cssVar.colorFillQuaternary};

    transition: border-color 0.15s ease;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorderHover};
    }
  `,
  cardSelected: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  error: css`
    color: ${cssVar.colorError};
  `,
  label: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  mode: css`
    padding-block: 1px;
    padding-inline: 6px;
    border-radius: 6px;

    font-size: 11px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  prompt: css`
    overflow: auto;

    max-height: 160px;
    margin: 0;
    padding: 8px;
    border-radius: 8px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    white-space: pre-wrap;

    background: ${cssVar.colorFillTertiary};
  `,
  warning: css`
    color: ${cssVar.colorWarning};
  `,
}));

interface ConceptCardProps {
  concept: AnimationConcept;
  onToggle: () => void;
  selected: boolean;
}

const ConceptCard = memo<ConceptCardProps>(({ concept, selected, onToggle }) => {
  const { t } = useTranslation('video');
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <Flexbox
      aria-checked={selected}
      className={cx(styles.card, selected && styles.cardSelected)}
      gap={6}
      role={'checkbox'}
      onClick={onToggle}
    >
      <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
        <Text weight={500}>
          {selected ? '☑' : '☐'} {concept.title}
        </Text>
        <span className={styles.mode}>
          {t(`autoAnimate.mode.${concept.mode}`)} · {concept.params.duration}s
        </span>
      </Flexbox>
      <span className={styles.label}>{concept.blurb}</span>
      {concept.errors.map((e) => (
        <span className={styles.error} key={e}>
          ✕ {e}
        </span>
      ))}
      {concept.warnings.map((w) => (
        <span className={styles.warning} key={w}>
          ⚠ {w}
        </span>
      ))}
      <Button
        size={'small'}
        style={{ alignSelf: 'flex-start' }}
        type={'text'}
        onClick={(e) => {
          e.stopPropagation();
          setShowPrompt((v) => !v);
        }}
      >
        {showPrompt ? t('autoAnimate.hidePrompt') : t('autoAnimate.showPrompt')}
      </Button>
      {showPrompt && <pre className={styles.prompt}>{concept.prompt}</pre>}
    </Flexbox>
  );
});

interface AutoAnimateModalProps {
  onClose: () => void;
  open: boolean;
}

const AutoAnimateModal = memo<AutoAnimateModalProps>(({ open, onClose }) => {
  const { t } = useTranslation('video');
  const { allowed: canCreate } = usePermission('create_content');
  const { value: imageUrl } = useVideoGenerationConfigParam('imageUrl');
  const { value: currentPrompt } = useVideoGenerationConfigParam('prompt');
  const createVideosFromRequests = useVideoStore((s) => s.createVideosFromRequests);
  const isCreating = useVideoStore(createVideoSelectors.isCreating);

  const [description, setDescription] = useState(() => currentPrompt ?? '');
  const [category, setCategory] = useState<ProductCategory>('generic');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [placement, setPlacement] = useState<Placement>('vertical');
  const [seeds] = useState(() => generateUniqueSeeds(4));
  // Every valid concept is selected by default; we only track opt-outs so a
  // category/placement change never has to re-seed the selection.
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());

  // Auto-detect the category from the description until the user picks one.
  useEffect(() => {
    if (!categoryTouched) setCategory(detectCategory(description));
  }, [description, categoryTouched]);

  const concepts = useMemo(
    () => buildConcepts({ category, description, imageUrl, placement, seeds }),
    [category, description, imageUrl, placement, seeds],
  );

  const toggle = useCallback((id: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isSelected = (c: AnimationConcept) => !deselected.has(c.id) && c.errors.length === 0;
  const chosen = concepts.filter((c) => isSelected(c));

  const handleGenerate = useCallback(async () => {
    if (!canCreate || chosen.length === 0) return;
    try {
      await createVideosFromRequests(
        chosen.map((c) => ({ model: c.model, params: c.params, provider: FAL_PROVIDER })),
      );
      toast.success({
        description: t('autoAnimate.started', { count: chosen.length }),
        duration: 3000,
      });
      onClose();
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : String(error),
        duration: 5000,
      });
    }
  }, [canCreate, chosen, createVideosFromRequests, onClose, t]);

  const categoryOptions = useMemo(
    () => PRODUCT_CATEGORIES.map((c) => ({ label: c.label, value: c.id })),
    [],
  );
  const placementOptions = useMemo(
    () => [
      { label: t('cameraDirector.placement.vertical'), value: 'vertical' as Placement },
      { label: t('cameraDirector.placement.landscape'), value: 'landscape' as Placement },
      { label: t('cameraDirector.placement.square'), value: 'square' as Placement },
    ],
    [t],
  );

  const footer = (
    <Flexbox horizontal align={'center'} gap={8} justify={'space-between'} padding={12}>
      <span className={styles.label}>
        {imageUrl ? t('autoAnimate.usingPhoto') : t('autoAnimate.noPhoto')}
      </span>
      <Flexbox horizontal gap={8}>
        <Button onClick={onClose}>{t('cameraDirector.cancel')}</Button>
        <Button
          disabled={!canCreate || chosen.length === 0}
          loading={isCreating}
          type={'primary'}
          onClick={handleGenerate}
        >
          {t('autoAnimate.generate', { count: chosen.length })}
        </Button>
      </Flexbox>
    </Flexbox>
  );

  return (
    <ImperativeModal
      allowFullscreen
      footer={footer}
      open={open}
      title={t('autoAnimate.title')}
      width={720}
      onCancel={onClose}
    >
      <Flexbox gap={14}>
        <Text type={'secondary'}>{t('autoAnimate.subtitle')}</Text>

        <Flexbox gap={4}>
          <span className={styles.label}>{t('autoAnimate.description')}</span>
          <TextArea
            autoFocus
            autoSize={{ maxRows: 4, minRows: 2 }}
            placeholder={t('autoAnimate.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Flexbox>

        <Flexbox horizontal gap={12} style={{ flexWrap: 'wrap' }}>
          <Flexbox gap={4} style={{ minWidth: 260 }}>
            <span className={styles.label}>{t('autoAnimate.category')}</span>
            <Select
              options={categoryOptions}
              value={category}
              onChange={(v) => {
                setCategoryTouched(true);
                setCategory(v as ProductCategory);
              }}
            />
          </Flexbox>
          <Flexbox gap={4}>
            <span className={styles.label}>{t('cameraDirector.field.placement')}</span>
            <Segmented
              options={placementOptions}
              value={placement}
              onChange={(v) => setPlacement(v as Placement)}
            />
          </Flexbox>
        </Flexbox>

        <Text weight={500}>{t('autoAnimate.concepts')}</Text>
        <Flexbox gap={8}>
          {concepts.map((c) => (
            <ConceptCard
              concept={c}
              key={c.id}
              selected={isSelected(c)}
              onToggle={() => toggle(c.id)}
            />
          ))}
        </Flexbox>
      </Flexbox>
    </ImperativeModal>
  );
});

/**
 * Toolbar entry point. Shown whenever the fal provider exposes the H3 models
 * Auto-animate targets, independent of which model is selected.
 */
const AutoAnimateAction = memo(() => {
  const { t } = useTranslation('video');
  const [open, setOpen] = useState(false);
  const enabledVideoModelList = useAiInfraStore(aiProviderSelectors.enabledVideoModelList);

  const available = useMemo(() => {
    const fal = enabledVideoModelList.find((p) => p.id === FAL_PROVIDER);
    if (!fal) return false;
    const ids = new Set(fal.children.map((m) => m.id));
    return ids.has(AUTO_ANIMATE_MODELS.startFrame);
  }, [enabledVideoModelList]);

  if (!available) return null;

  return (
    <>
      <Action icon={Sparkles} title={t('autoAnimate.title')} onClick={() => setOpen(true)} />
      {open && <AutoAnimateModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
});

AutoAnimateAction.displayName = 'AutoAnimateAction';

export default AutoAnimateAction;
