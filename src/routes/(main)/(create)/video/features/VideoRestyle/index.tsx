'use client';

import { Flexbox, TextArea } from '@lobehub/ui';
import { Button, Segmented, SliderWithInput, Switch, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Upload, Wand2 } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { useFileStore } from '@/store/file';
import { useVideoStore } from '@/store/video';

import {
  buildRestyleRequest,
  estimateRestyleCost,
  formatUsd,
  getRestyleEngine,
  RESTYLE_CLIP_LENGTH_DEFAULT_S,
  RESTYLE_CLIP_LENGTH_MAX_S,
  RESTYLE_CLIP_LENGTH_MIN_S,
  RESTYLE_ENGINES,
  type RestyleEngine,
} from './restyle';

const styles = createStaticStyles(({ css, cssVar }) => ({
  cost: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  label: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  preview: css`
    max-width: 160px;
    max-height: 120px;
    border-radius: 8px;
    object-fit: cover;
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

interface VideoRestyleModalProps {
  onClose: () => void;
  open: boolean;
}

const VideoRestyleModal = memo<VideoRestyleModalProps>(({ open, onClose }) => {
  const { t } = useTranslation('video');
  const { allowed: canCreate } = usePermission('create_content');
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const createVideosFromRequests = useVideoStore((s) => s.createVideosFromRequests);

  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [engine, setEngine] = useState<RestyleEngine>('lucy');
  const [prompt, setPrompt] = useState('');
  const [keepAudio, setKeepAudio] = useState(true);
  const [clipLength, setClipLength] = useState(RESTYLE_CLIP_LENGTH_DEFAULT_S);
  const [busy, setBusy] = useState(false);
  const clipInputRef = useRef<HTMLInputElement>(null);

  const engineSpec = getRestyleEngine(engine);
  const cost = estimateRestyleCost(engine, clipLength);
  const ready = !!clipUrl && !!prompt.trim();

  const engineOptions = RESTYLE_ENGINES.map((e) => ({ label: e.label, value: e.id }));

  const onClipFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      setUploading(true);
      try {
        const uploaded = await uploadWithProgress({
          file,
          onStatusUpdate: () => {},
          skipCheckFileType: true,
        });
        if (!uploaded?.url) throw new Error('Upload failed');
        setClipUrl(uploaded.url);
      } catch (error) {
        toast.error({
          description: error instanceof Error ? error.message : String(error),
          duration: 4000,
        });
      } finally {
        setUploading(false);
      }
    },
    [uploadWithProgress],
  );

  const generate = useCallback(async () => {
    if (!canCreate || busy || !clipUrl) return;
    setBusy(true);
    try {
      await createVideosFromRequests([
        buildRestyleRequest({ engine, keepAudio, prompt, videoUrl: clipUrl }),
      ]);
      toast.success({ description: t('videoRestyle.started'), duration: 3000 });
      onClose();
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : String(error),
        duration: 5000,
      });
    } finally {
      setBusy(false);
    }
  }, [canCreate, busy, clipUrl, createVideosFromRequests, engine, keepAudio, prompt, onClose, t]);

  return (
    <ImperativeModal
      allowFullscreen
      footer={null}
      open={open}
      title={t('videoRestyle.title')}
      width={640}
      onCancel={onClose}
    >
      <Flexbox gap={16}>
        <Text type={'secondary'}>{t('videoRestyle.subtitle')}</Text>

        <input
          accept={'video/*'}
          ref={clipInputRef}
          style={{ display: 'none' }}
          type={'file'}
          onChange={onClipFile}
        />
        <Field label={t('videoRestyle.clip')}>
          <Flexbox horizontal align={'center'} gap={12}>
            {clipUrl && (
              <video
                controls
                className={styles.preview}
                data-testid={'restyle-clip-preview'}
                src={clipUrl}
              />
            )}
            <Button
              data-testid={'restyle-upload-clip'}
              disabled={!canCreate}
              icon={<Upload size={14} />}
              loading={uploading}
              size={'small'}
              onClick={() => clipInputRef.current?.click()}
            >
              {clipUrl ? t('videoRestyle.replaceClip') : t('videoRestyle.uploadClip')}
            </Button>
          </Flexbox>
        </Field>

        <Field label={t('videoRestyle.engine')}>
          <Segmented
            block
            options={engineOptions}
            value={engine}
            onChange={(v) => setEngine(v as RestyleEngine)}
          />
          <span className={styles.cost}>{engineSpec.description}</span>
        </Field>

        <Field label={t('videoRestyle.prompt')}>
          <TextArea
            autoSize={{ maxRows: 6, minRows: 3 }}
            data-testid={'restyle-prompt'}
            placeholder={t('videoRestyle.promptPlaceholder')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>

        {engineSpec.supportsKeepAudio && (
          <Flexbox horizontal align={'center'} justify={'space-between'}>
            <Text weight={500}>{t('videoRestyle.keepAudio')}</Text>
            <Switch checked={keepAudio} onChange={setKeepAudio} />
          </Flexbox>
        )}

        <Field
          label={t('videoRestyle.clipLength', {
            seconds: String(clipLength),
          })}
        >
          <SliderWithInput
            max={RESTYLE_CLIP_LENGTH_MAX_S}
            min={RESTYLE_CLIP_LENGTH_MIN_S}
            step={1}
            value={clipLength}
            onChange={(v) => setClipLength(Number(v))}
          />
        </Field>

        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <span className={styles.cost}>
            {t('videoRestyle.estimate', { cost: formatUsd(cost) })}
          </span>
          <Button
            data-testid={'restyle-generate'}
            disabled={!canCreate || !ready}
            loading={busy}
            type={'primary'}
            onClick={generate}
          >
            {t('videoRestyle.generate')}
          </Button>
        </Flexbox>
      </Flexbox>
    </ImperativeModal>
  );
});

interface VideoRestyleActionProps {
  /** Controlled open state (used by the Tools menu); uncontrolled by default. */
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  /** Render the bare toolbar icon trigger. Set false when a menu opens this tool instead. @default true */
  renderTrigger?: boolean;
}

/** Toolbar entry point for the video workspace. */
const VideoRestyleAction = memo<VideoRestyleActionProps>(
  ({ open: openProp, onOpenChange, renderTrigger = true }) => {
    const { t } = useTranslation('video');
    const [internalOpen, setInternalOpen] = useState(false);

    const open = openProp ?? internalOpen;
    const setOpen = useCallback(
      (next: boolean) => {
        setInternalOpen(next);
        onOpenChange?.(next);
      },
      [onOpenChange],
    );

    return (
      <>
        {renderTrigger && (
          <Action icon={Wand2} title={t('videoRestyle.title')} onClick={() => setOpen(true)} />
        )}
        {open && <VideoRestyleModal open={open} onClose={() => setOpen(false)} />}
      </>
    );
  },
);

VideoRestyleAction.displayName = 'VideoRestyleAction';

export default VideoRestyleAction;
