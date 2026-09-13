'use client';

import type { BrandKit } from '@lobechat/types';
import { Flexbox, Input, TextArea } from '@lobehub/ui';
import { Button, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { useFileStore } from '@/store/file';

import {
  createEmptyBrandKit,
  isHexColor,
  MAX_BRAND_COLORS,
  MAX_BRAND_FONTS,
  normalizeHexColor,
  validateBrandKit,
} from './brandKit';
import { useBrandKits } from './useBrandKits';

const styles = createStaticStyles(({ css, cssVar }) => ({
  active: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  chip: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;

    padding-block: 2px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 999px;

    font-size: 12px;

    background: ${cssVar.colorFillQuaternary};
  `,
  kitRow: css`
    cursor: pointer;

    padding-block: 8px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  label: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  list: css`
    flex: 0 0 220px;
    min-width: 200px;
  `,
  logo: css`
    max-width: 160px;
    max-height: 64px;
    border-radius: 6px;
    object-fit: contain;
  `,
  swatch: css`
    width: 14px;
    height: 14px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 3px;
  `,
}));

const newId = () => `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface ChipListProps {
  items: string[];
  max: number;
  onChange: (items: string[]) => void;
  placeholder: string;
  swatch?: boolean;
  testId: string;
  validate?: (value: string) => string | null;
}

/** Inline "type, press Enter, chips accumulate" editor for colours and fonts. */
const ChipList = memo<ChipListProps>(
  ({ items, onChange, placeholder, max, swatch, validate, testId }) => {
    const [draft, setDraft] = useState('');

    const commit = useCallback(() => {
      const raw = draft.trim();
      if (!raw) return;
      const value = validate ? validate(raw) : raw;
      if (!value) {
        toast.error({ description: 'Use a hex colour like #0F172A', duration: 2500 });
        return;
      }
      if (items.includes(value) || items.length >= max) {
        setDraft('');
        return;
      }
      onChange([...items, value]);
      setDraft('');
    }, [draft, items, max, onChange, validate]);

    return (
      <Flexbox gap={6}>
        <Flexbox horizontal gap={6} style={{ flexWrap: 'wrap' }}>
          {items.map((item) => (
            <span className={styles.chip} key={item}>
              {swatch && <span className={styles.swatch} style={{ background: item }} />}
              {item}
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => onChange(items.filter((i) => i !== item))}
              />
            </span>
          ))}
        </Flexbox>
        {items.length < max && (
          <Input
            data-testid={testId}
            placeholder={placeholder}
            size={'small'}
            value={draft}
            onBlur={commit}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={(e) => {
              e.preventDefault();
              commit();
            }}
          />
        )}
      </Flexbox>
    );
  },
);

interface BrandKitEditorProps {
  onClose: () => void;
  open: boolean;
}

const BrandKitEditor = memo<BrandKitEditorProps>(({ open, onClose }) => {
  const { t } = useTranslation('image');
  const { kits, activeKitId, saveKit, deleteKit, setActiveKitId } = useBrandKits();
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string>(() => activeKitId || kits[0]?.id || '');
  const [draft, setDraft] = useState<BrandKit>(() => {
    const existing = kits.find((k) => k.id === (activeKitId || kits[0]?.id));
    return existing ? { ...existing } : createEmptyBrandKit(newId());
  });
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Switching rows loads that kit into the form.
  useEffect(() => {
    const existing = kits.find((k) => k.id === selectedId);
    if (existing) setDraft({ ...existing });
  }, [kits, selectedId]);

  const isNew = !kits.some((k) => k.id === draft.id);
  const errors = useMemo(() => validateBrandKit(draft), [draft]);

  const update = useCallback((patch: Partial<BrandKit>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const startNew = useCallback(() => {
    const kit = createEmptyBrandKit(newId());
    setSelectedId(kit.id);
    setDraft(kit);
  }, []);

  const handleSave = useCallback(async () => {
    if (errors.length > 0) return;
    setSaving(true);
    try {
      const saved = await saveKit(draft);
      setSelectedId(saved.id);
      if (!activeKitId) await setActiveKitId(saved.id);
      toast.success({ description: t('brandKit.saved'), duration: 2000 });
    } finally {
      setSaving(false);
    }
  }, [activeKitId, draft, errors.length, saveKit, setActiveKitId, t]);

  const handleDelete = useCallback(async () => {
    if (isNew) return;
    setSaving(true);
    try {
      await deleteKit(draft.id);
      const remaining = kits.find((k) => k.id !== draft.id);
      if (remaining) setSelectedId(remaining.id);
      else startNew();
    } finally {
      setSaving(false);
    }
  }, [deleteKit, draft.id, isNew, kits, startNew]);

  const handleLogoFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setLogoUploading(true);
      try {
        const uploaded = await uploadWithProgress({
          file,
          onStatusUpdate: () => {},
          skipCheckFileType: true,
        });
        if (uploaded?.url) update({ logoUrl: uploaded.url });
      } catch {
        toast.error({ description: t('brandKit.logoUploadFailed'), duration: 3000 });
      } finally {
        setLogoUploading(false);
      }
    },
    [t, update, uploadWithProgress],
  );

  const footer = (
    <Flexbox horizontal gap={8} justify={'space-between'} padding={12}>
      <Button danger disabled={isNew || saving} icon={<Trash2 size={14} />} onClick={handleDelete}>
        {t('brandKit.delete')}
      </Button>
      <Flexbox horizontal gap={8}>
        <Button onClick={onClose}>{t('brandKit.close')}</Button>
        <Button
          data-testid={'brandkit-save'}
          disabled={errors.length > 0 || saving}
          loading={saving}
          type={'primary'}
          onClick={handleSave}
        >
          {t('brandKit.save')}
        </Button>
      </Flexbox>
    </Flexbox>
  );

  return (
    <ImperativeModal
      footer={footer}
      open={open}
      title={t('brandKit.manageTitle')}
      width={860}
      onCancel={onClose}
    >
      <Flexbox horizontal gap={20} style={{ flexWrap: 'wrap' }}>
        <Flexbox className={styles.list} gap={8}>
          <Flexbox horizontal align={'center'} justify={'space-between'}>
            <Text weight={500}>{t('brandKit.yourKits')}</Text>
            <Action icon={Plus} title={t('brandKit.new')} onClick={startNew} />
          </Flexbox>
          {kits.length === 0 && <span className={styles.label}>{t('brandKit.empty')}</span>}
          {kits.map((kit) => (
            <div
              className={`${styles.kitRow} ${kit.id === selectedId ? styles.active : ''}`}
              key={kit.id}
              onClick={() => setSelectedId(kit.id)}
            >
              <Flexbox gap={4}>
                <Text weight={500}>{kit.name || t('brandKit.untitled')}</Text>
                <Flexbox horizontal gap={4}>
                  {kit.colors.slice(0, 6).map((c) => (
                    <span className={styles.swatch} key={c} style={{ background: c }} />
                  ))}
                </Flexbox>
              </Flexbox>
            </div>
          ))}
        </Flexbox>

        <Flexbox gap={12} style={{ flex: 1, minWidth: 320 }}>
          <Flexbox gap={4}>
            <span className={styles.label}>{t('brandKit.field.name')}</span>
            <Input
              data-testid={'brandkit-name'}
              placeholder={t('brandKit.field.namePlaceholder')}
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Flexbox>

          <Flexbox gap={4}>
            <span className={styles.label}>
              {t('brandKit.field.colors', { max: MAX_BRAND_COLORS })}
            </span>
            <ChipList
              swatch
              items={draft.colors}
              max={MAX_BRAND_COLORS}
              placeholder={'#0F172A'}
              testId={'brandkit-color-input'}
              validate={(v) => (isHexColor(v) ? normalizeHexColor(v) : null)}
              onChange={(colors) => update({ colors })}
            />
          </Flexbox>

          <Flexbox gap={4}>
            <span className={styles.label}>
              {t('brandKit.field.fonts', { max: MAX_BRAND_FONTS })}
            </span>
            <ChipList
              items={draft.fonts}
              max={MAX_BRAND_FONTS}
              placeholder={t('brandKit.field.fontsPlaceholder')}
              testId={'brandkit-font-input'}
              onChange={(fonts) => update({ fonts })}
            />
          </Flexbox>

          <Flexbox gap={4}>
            <span className={styles.label}>{t('brandKit.field.logo')}</span>
            <input
              accept={'image/*'}
              data-testid={'brandkit-logo-input'}
              ref={logoInputRef}
              style={{ display: 'none' }}
              type={'file'}
              onChange={handleLogoFile}
            />
            <Flexbox horizontal align={'center'} gap={8}>
              {draft.logoUrl && <img alt={'logo'} className={styles.logo} src={draft.logoUrl} />}
              <Button
                icon={<Upload size={14} />}
                loading={logoUploading}
                size={'small'}
                onClick={() => logoInputRef.current?.click()}
              >
                {draft.logoUrl ? t('brandKit.field.logoReplace') : t('brandKit.field.logoUpload')}
              </Button>
              {draft.logoUrl && (
                <Button size={'small'} onClick={() => update({ logoUrl: undefined })}>
                  {t('brandKit.field.logoRemove')}
                </Button>
              )}
            </Flexbox>
          </Flexbox>

          <Flexbox gap={4}>
            <span className={styles.label}>{t('brandKit.field.styleNotes')}</span>
            <TextArea
              autoSize={{ maxRows: 5, minRows: 2 }}
              placeholder={t('brandKit.field.styleNotesPlaceholder')}
              value={draft.styleNotes}
              onChange={(e) => update({ styleNotes: e.target.value })}
            />
          </Flexbox>

          <Flexbox gap={4}>
            <span className={styles.label}>{t('brandKit.field.toneOfVoice')}</span>
            <TextArea
              autoSize={{ maxRows: 5, minRows: 2 }}
              placeholder={t('brandKit.field.toneOfVoicePlaceholder')}
              value={draft.toneOfVoice}
              onChange={(e) => update({ toneOfVoice: e.target.value })}
            />
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </ImperativeModal>
  );
});

BrandKitEditor.displayName = 'BrandKitEditor';

export default BrandKitEditor;
