'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Checkbox, Input, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { ChevronDown, ChevronUp, Film, Upload } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { finalCutService } from '@/services/finalCut';
import { useFileStore } from '@/store/file';
import { useVideoStore } from '@/store/video';
import { generationBatchSelectors } from '@/store/video/selectors';
import { AsyncTaskStatus } from '@/types/asyncTask';

import {
  buildFinalCutRequest,
  listSelectableClips,
  moveClip,
  toggleClipSelection,
} from './finalCut';

const styles = createStaticStyles(({ css, cssVar }) => ({
  cost: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  empty: css`
    padding: 16px;
    border: 1px dashed ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-align: center;
  `,
  player: css`
    width: 100%;
  `,
  result: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  row: css`
    padding: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
  `,
  rowLabel: css`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

type JobState =
  | { status: 'error' | 'running' | 'idle' }
  | { durationSeconds?: number; status: 'success'; url: string };

/** Extracts a readable message from an AsyncTaskError-shaped value (see packages/types/src/asyncTask.ts). */
function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'body' in error) {
    const body = (error as { body?: unknown }).body;
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

interface FinalCutModalProps {
  onClose: () => void;
  open: boolean;
}

const FinalCutModal = memo<FinalCutModalProps>(({ open, onClose }) => {
  const { t } = useTranslation('video');
  const { allowed: canCreate } = usePermission('create_content');
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const batches = useVideoStore(generationBatchSelectors.currentGenerationBatches);

  const clips = useMemo(() => listSelectableClips(batches), [batches]);
  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);

  const [order, setOrder] = useState<string[]>(() => clips.map((clip) => clip.id));
  const [selected, setSelected] = useState<string[]>(() => clips.map((clip) => clip.id));

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioUrlDraft, setAudioUrlDraft] = useState('');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [job, setJob] = useState<JobState>({ status: 'idle' });
  const [jobError, setJobError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const selectedCount = selected.length;
  const orderedSelectedUrls = useMemo(
    () =>
      order
        .filter((id) => selected.includes(id))
        .map((id) => clipsById.get(id)?.url)
        .filter((url): url is string => Boolean(url)),
    [order, selected, clipsById],
  );

  const uploadAudio = useCallback(
    async (file: File) => {
      setUploadingAudio(true);
      try {
        const uploaded = await uploadWithProgress({
          file,
          onStatusUpdate: () => {},
          skipCheckFileType: true,
        });
        if (!uploaded?.url) throw new Error('Upload failed');
        setAudioUrl(uploaded.url);
        setAudioUrlDraft(uploaded.url);
      } catch (error) {
        toast.error({
          description: error instanceof Error ? error.message : String(error),
          duration: 4000,
        });
      } finally {
        setUploadingAudio(false);
      }
    },
    [uploadWithProgress],
  );

  const onAudioFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) await uploadAudio(file);
    },
    [uploadAudio],
  );

  const handleExport = useCallback(async () => {
    if (!canCreate || job.status === 'running') return;

    let request;
    try {
      request = buildFinalCutRequest(orderedSelectedUrls, audioUrl ?? audioUrlDraft.trim());
    } catch (error) {
      toast.error({
        description: error instanceof Error ? error.message : String(error),
        duration: 4000,
      });
      return;
    }

    setJob({ status: 'running' });
    setJobError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { taskId } = await finalCutService.create(request);
      const result = await finalCutService.pollUntilDone(taskId, { signal: controller.signal });

      if (result.status === AsyncTaskStatus.Success && result.url) {
        setJob({ durationSeconds: result.durationSeconds, status: 'success', url: result.url });
      } else {
        setJob({ status: 'error' });
        setJobError(extractErrorMessage(result.error) || t('finalCut.export.error'));
      }
    } catch (error) {
      setJob({ status: 'error' });
      setJobError(extractErrorMessage(error));
    }
  }, [canCreate, job.status, orderedSelectedUrls, audioUrl, audioUrlDraft, t]);

  const isRunning = job.status === 'running';

  return (
    <ImperativeModal
      allowFullscreen
      footer={null}
      open={open}
      title={t('finalCut.title')}
      width={640}
      onCancel={onClose}
    >
      <Flexbox gap={16}>
        <Text type={'secondary'}>{t('finalCut.subtitle')}</Text>

        <Flexbox gap={8}>
          <Flexbox horizontal align={'center'} justify={'space-between'}>
            <Text weight={500}>{t('finalCut.clips.title')}</Text>
            <span className={styles.cost}>
              {t('finalCut.clips.selected', {
                selected: String(selectedCount),
                total: String(clips.length),
              })}
            </span>
          </Flexbox>

          {clips.length === 0 ? (
            <div className={styles.empty}>{t('finalCut.clips.empty')}</div>
          ) : (
            <Flexbox gap={6}>
              {order.map((id, index) => {
                const clip = clipsById.get(id);
                if (!clip) return null;

                return (
                  <Flexbox
                    horizontal
                    align={'center'}
                    className={styles.row}
                    data-testid={'final-cut-clip-row'}
                    gap={8}
                    key={id}
                  >
                    <Checkbox
                      checked={selected.includes(id)}
                      data-testid={`final-cut-clip-checkbox-${id}`}
                      onChange={() => setSelected((prev) => toggleClipSelection(prev, id))}
                    />
                    <span className={styles.rowLabel}>{clip.label || clip.id}</span>
                    <Button
                      disabled={index === 0}
                      icon={<ChevronUp size={14} />}
                      size={'small'}
                      title={t('finalCut.clips.moveUp')}
                      type={'text'}
                      onClick={() => setOrder((prev) => moveClip(prev, id, 'up'))}
                    />
                    <Button
                      disabled={index === order.length - 1}
                      icon={<ChevronDown size={14} />}
                      size={'small'}
                      title={t('finalCut.clips.moveDown')}
                      type={'text'}
                      onClick={() => setOrder((prev) => moveClip(prev, id, 'down'))}
                    />
                  </Flexbox>
                );
              })}
            </Flexbox>
          )}
        </Flexbox>

        <Flexbox gap={8}>
          <Text weight={500}>{t('finalCut.audio.title')}</Text>
          <input
            accept={'audio/*'}
            ref={audioInputRef}
            style={{ display: 'none' }}
            type={'file'}
            onChange={onAudioFile}
          />
          <Flexbox horizontal gap={8}>
            <Button
              icon={<Upload size={14} />}
              loading={uploadingAudio}
              size={'small'}
              onClick={() => audioInputRef.current?.click()}
            >
              {audioUrl ? t('finalCut.audio.replace') : t('finalCut.audio.upload')}
            </Button>
            {audioUrl && (
              <Button
                size={'small'}
                type={'text'}
                onClick={() => {
                  setAudioUrl(null);
                  setAudioUrlDraft('');
                }}
              >
                {t('finalCut.audio.clear')}
              </Button>
            )}
          </Flexbox>
          <Input
            data-testid={'final-cut-audio-url'}
            placeholder={t('finalCut.audio.urlPlaceholder')}
            value={audioUrlDraft}
            onChange={(e) => {
              setAudioUrlDraft(e.target.value);
              setAudioUrl(null);
            }}
          />
          {(audioUrl ?? audioUrlDraft.trim()) && (
            <audio controls className={styles.player} src={audioUrl ?? audioUrlDraft.trim()} />
          )}
        </Flexbox>

        {job.status === 'success' && (
          <Flexbox className={styles.result} data-testid={'final-cut-result'} gap={8}>
            <video controls className={styles.player} src={job.url} />
            <Flexbox horizontal gap={8} justify={'flex-end'}>
              <Button href={job.url} size={'small'} target={'_blank'} type={'link'}>
                {t('finalCut.export.download')}
              </Button>
            </Flexbox>
          </Flexbox>
        )}

        {job.status === 'error' && jobError && (
          <Text type={'danger'}>
            {t('finalCut.export.error')}: {jobError}
          </Text>
        )}

        <Flexbox horizontal justify={'flex-end'}>
          <Button
            data-testid={'final-cut-export'}
            disabled={!canCreate || clips.length === 0}
            loading={isRunning}
            type={'primary'}
            onClick={handleExport}
          >
            {isRunning ? t('finalCut.export.running') : t('finalCut.export.button')}
          </Button>
        </Flexbox>
      </Flexbox>
    </ImperativeModal>
  );
});

FinalCutModal.displayName = 'FinalCutModal';

/** Toolbar entry point for the video workspace. */
const FinalCutAction = memo(() => {
  const { t } = useTranslation('video');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Action icon={Film} title={t('finalCut.title')} onClick={() => setOpen(true)} />
      {open && <FinalCutModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
});

FinalCutAction.displayName = 'FinalCutAction';

export default FinalCutAction;
