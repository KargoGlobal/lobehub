'use client';

import { Flexbox, TextArea } from '@lobehub/ui';
import {
  Button,
  Segmented,
  Select,
  SliderWithInput,
  Switch,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Mic, Upload } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { applyBrandPreamble, useBrandKits } from '@/features/BrandKit';
import Action from '@/features/ChatInput/ActionBar/components/Action';
import { usePermission } from '@/hooks/usePermission';
import { type GeneratedAudio, voiceService } from '@/services/voice';
import { useFileStore } from '@/store/file';
import { useServerConfigStore } from '@/store/serverConfig';
import { useVideoStore } from '@/store/video';
import { useVideoGenerationConfigParam } from '@/store/video/slices/generationConfig/hooks';

import {
  type AvatarMode,
  type AvatarResolution,
  buildAvatarRequest,
  buildMusicRequest,
  buildSfxRequest,
  buildSpeechRequest,
  estimateAvatarCost,
  estimateMusicCost,
  estimateSfxCost,
  estimateSpeechCost,
  estimateSpeechSeconds,
  formatUsd,
  getSpeechEngine,
  MUSIC_LENGTH_DEFAULT_S,
  MUSIC_LENGTH_MAX_S,
  MUSIC_LENGTH_MIN_S,
  OMNIHUMAN_MAX_AUDIO_S,
  SFX_DURATION_MAX_S,
  SFX_DURATION_MIN_S,
  SFX_MAX_CHARS,
  SPEECH_ENGINES,
  type SpeechEngine,
} from './voice';

type Tab = 'speech' | 'music' | 'sfx' | 'avatar';

const styles = createStaticStyles(({ css, cssVar }) => ({
  cost: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  disclosure: css`
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorWarningBorder};
    border-radius: 8px;

    font-size: 12px;
    line-height: 1.5;

    background: ${cssVar.colorWarningBg};
  `,
  label: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  player: css`
    width: 100%;
  `,
  preview: css`
    max-width: 120px;
    max-height: 120px;
    border-radius: 8px;
    object-fit: cover;
  `,
  result: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
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

interface AudioResultProps {
  audio: GeneratedAudio;
  onUseForAvatar?: () => void;
  useLabel?: string;
}

const AudioResult = memo<AudioResultProps>(({ audio, onUseForAvatar, useLabel }) => (
  <Flexbox className={styles.result} gap={8}>
    <audio controls className={styles.player} data-testid={`audio-${audio.kind}`} src={audio.url} />
    <Flexbox horizontal gap={8} justify={'flex-end'}>
      <Button href={audio.url} size={'small'} target={'_blank'} type={'link'}>
        {'↓'}
      </Button>
      {onUseForAvatar && (
        <Button size={'small'} type={'primary'} onClick={onUseForAvatar}>
          {useLabel}
        </Button>
      )}
    </Flexbox>
  </Flexbox>
));

interface AdVoiceModalProps {
  onClose: () => void;
  open: boolean;
}

const AdVoiceModal = memo<AdVoiceModalProps>(({ open, onClose }) => {
  const { t } = useTranslation('video');
  const { allowed: canCreate } = usePermission('create_content');
  const avatarEnabled = useServerConfigStore(
    (s) => s.featureFlags.enableSyntheticPerformer === true,
  );
  const { activeKit } = useBrandKits();
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const createVideosFromRequests = useVideoStore((s) => s.createVideosFromRequests);
  const { value: startFrame } = useVideoGenerationConfigParam('imageUrl');

  const [tab, setTab] = useState<Tab>('speech');

  // --- speech
  const [script, setScript] = useState('');
  const [engine, setEngine] = useState<SpeechEngine>('elevenlabs');
  const engineSpec = getSpeechEngine(engine);
  const [voice, setVoice] = useState<string>(engineSpec.voices[0].value);
  const [speed, setSpeed] = useState(1);
  const [speech, setSpeech] = useState<GeneratedAudio | null>(null);

  // --- music
  const [musicBrief, setMusicBrief] = useState('');
  const [musicLength, setMusicLength] = useState(MUSIC_LENGTH_DEFAULT_S);
  const [instrumental, setInstrumental] = useState(true);
  const [music, setMusic] = useState<GeneratedAudio | null>(null);

  // --- sfx
  const [sfxText, setSfxText] = useState('');
  const [sfxDuration, setSfxDuration] = useState<number | undefined>(undefined);
  const [sfx, setSfx] = useState<GeneratedAudio | null>(null);

  // --- avatar
  const [avatarMode, setAvatarMode] = useState<AvatarMode>('talkingPhoto');
  const [avatarResolution, setAvatarResolution] = useState<AvatarResolution>('1080p');
  const [performerUrl, setPerformerUrl] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [avatarAudioUrl, setAvatarAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'audio' | 'clip' | 'photo' | null>(null);
  const performerInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);

  const changeEngine = useCallback((next: SpeechEngine) => {
    setEngine(next);
    setVoice(getSpeechEngine(next).voices[0].value);
    setSpeed(1);
  }, []);

  const speechSeconds = estimateSpeechSeconds(script, speed);
  const speechCost = estimateSpeechCost(script, engine);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (!canCreate || busy) return;
      setBusy(true);
      try {
        await fn();
      } catch (error) {
        toast.error({
          description: error instanceof Error ? error.message : String(error),
          duration: 5000,
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, canCreate],
  );

  const generateSpeech = () =>
    run(async () => {
      const result = await voiceService.generate(buildSpeechRequest(script, engine, voice, speed));
      setSpeech(result);
      setAvatarAudioUrl(result.url);
    });

  const generateMusic = () =>
    run(async () => {
      setMusic(
        await voiceService.generate(buildMusicRequest(musicBrief, musicLength, instrumental)),
      );
    });

  const generateSfx = () =>
    run(async () => {
      setSfx(await voiceService.generate(buildSfxRequest(sfxText, sfxDuration)));
    });

  const upload = useCallback(
    async (file: File, slot: 'audio' | 'clip' | 'photo') => {
      setUploading(slot);
      try {
        const uploaded = await uploadWithProgress({
          file,
          onStatusUpdate: () => {},
          skipCheckFileType: true,
        });
        if (!uploaded?.url) throw new Error('Upload failed');
        if (slot === 'photo') setPerformerUrl(uploaded.url);
        if (slot === 'clip') setClipUrl(uploaded.url);
        if (slot === 'audio') setAvatarAudioUrl(uploaded.url);
      } catch (error) {
        toast.error({
          description: error instanceof Error ? error.message : String(error),
          duration: 4000,
        });
      } finally {
        setUploading(null);
      }
    },
    [uploadWithProgress],
  );

  const onFile =
    (slot: 'audio' | 'clip' | 'photo') => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) await upload(file, slot);
    };

  const effectivePerformer = performerUrl ?? startFrame ?? null;
  const avatarAudioSeconds = speech ? speechSeconds : 30;
  const avatarCost = estimateAvatarCost(avatarMode, avatarAudioSeconds);
  const audioCap = OMNIHUMAN_MAX_AUDIO_S[avatarResolution];
  const avatarReady =
    !!avatarAudioUrl && (avatarMode === 'dubClip' ? !!clipUrl : !!effectivePerformer);

  const generateAvatar = () =>
    run(async () => {
      if (!avatarAudioUrl) return;
      const label = script.trim()
        ? `${t('adVoice.batchLabel')} · ${script.trim().slice(0, 60)}`
        : t('adVoice.batchLabel');
      await createVideosFromRequests([
        buildAvatarRequest({
          audioUrl: avatarAudioUrl,
          imageUrl: effectivePerformer ?? undefined,
          label,
          mode: avatarMode,
          resolution: avatarResolution,
          videoUrl: clipUrl ?? undefined,
        }),
      ]);
      toast.success({ description: t('adVoice.avatar.started'), duration: 3000 });
      onClose();
    });

  const tabOptions = useMemo(() => {
    const base = [
      { label: t('adVoice.tab.speech'), value: 'speech' as Tab },
      { label: t('adVoice.tab.music'), value: 'music' as Tab },
      { label: t('adVoice.tab.sfx'), value: 'sfx' as Tab },
    ];
    return avatarEnabled
      ? [...base, { label: t('adVoice.tab.avatar'), value: 'avatar' as Tab }]
      : base;
  }, [avatarEnabled, t]);

  const engineOptions = useMemo(
    () => SPEECH_ENGINES.map((e) => ({ label: e.label, value: e.id })),
    [],
  );

  return (
    <ImperativeModal
      allowFullscreen
      footer={null}
      open={open}
      title={t('adVoice.title')}
      width={760}
      onCancel={onClose}
    >
      <Flexbox gap={16}>
        <Text type={'secondary'}>{t('adVoice.subtitle')}</Text>
        <Segmented block options={tabOptions} value={tab} onChange={(v) => setTab(v as Tab)} />

        {tab === 'speech' && (
          <Flexbox gap={12}>
            <Field label={t('adVoice.speech.script')}>
              <TextArea
                autoSize={{ maxRows: 10, minRows: 4 }}
                data-testid={'advoice-script'}
                maxLength={engineSpec.maxChars}
                placeholder={t('adVoice.speech.scriptPlaceholder')}
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
              <Flexbox horizontal align={'center'} justify={'space-between'}>
                <span className={styles.cost}>
                  {t('adVoice.speech.estimate', {
                    chars: String(script.length),
                    cost: formatUsd(speechCost),
                    seconds: String(speechSeconds),
                  })}
                </span>
                {activeKit?.toneOfVoice && (
                  <Button
                    size={'small'}
                    type={'text'}
                    onClick={() => setScript(applyBrandPreamble(script, activeKit, 'script'))}
                  >
                    {t('adVoice.speech.addBrandVoice', { name: activeKit.name })}
                  </Button>
                )}
              </Flexbox>
            </Field>
            <Flexbox horizontal gap={12} style={{ flexWrap: 'wrap' }}>
              <Field label={t('adVoice.speech.engine')}>
                <Select
                  options={engineOptions}
                  style={{ minWidth: 220 }}
                  value={engine}
                  onChange={(v) => changeEngine(v as SpeechEngine)}
                />
              </Field>
              <Field label={t('adVoice.speech.voice')}>
                <Select
                  data-testid={'advoice-voice'}
                  options={engineSpec.voices}
                  style={{ minWidth: 260 }}
                  value={voice}
                  onChange={(v) => setVoice(String(v))}
                />
              </Field>
            </Flexbox>
            <Field label={t('adVoice.speech.speed', { value: speed.toFixed(2) })}>
              <SliderWithInput
                max={engineSpec.speed.max}
                min={engineSpec.speed.min}
                step={0.05}
                value={speed}
                onChange={(v) => setSpeed(Number(v))}
              />
            </Field>
            <Flexbox horizontal justify={'flex-end'}>
              <Button
                data-testid={'advoice-generate-speech'}
                disabled={!canCreate || !script.trim()}
                loading={busy}
                type={'primary'}
                onClick={generateSpeech}
              >
                {t('adVoice.speech.generate')}
              </Button>
            </Flexbox>
            {speech && (
              <AudioResult
                audio={speech}
                useLabel={t('adVoice.speech.useForAvatar')}
                onUseForAvatar={avatarEnabled ? () => setTab('avatar') : undefined}
              />
            )}
          </Flexbox>
        )}

        {tab === 'music' && (
          <Flexbox gap={12}>
            <Field label={t('adVoice.music.brief')}>
              <TextArea
                autoSize={{ maxRows: 6, minRows: 3 }}
                placeholder={t('adVoice.music.briefPlaceholder')}
                value={musicBrief}
                onChange={(e) => setMusicBrief(e.target.value)}
              />
            </Field>
            <Field label={t('adVoice.music.length', { seconds: String(musicLength) })}>
              <SliderWithInput
                max={MUSIC_LENGTH_MAX_S}
                min={MUSIC_LENGTH_MIN_S}
                step={1}
                value={musicLength}
                onChange={(v) => setMusicLength(Number(v))}
              />
            </Field>
            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <Text weight={500}>{t('adVoice.music.instrumental')}</Text>
              <Switch checked={instrumental} onChange={setInstrumental} />
            </Flexbox>
            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <span className={styles.cost}>
                {t('adVoice.music.estimate', { cost: formatUsd(estimateMusicCost(musicLength)) })}
              </span>
              <Button
                disabled={!canCreate || !musicBrief.trim()}
                loading={busy}
                type={'primary'}
                onClick={generateMusic}
              >
                {t('adVoice.music.generate')}
              </Button>
            </Flexbox>
            {music && <AudioResult audio={music} />}
          </Flexbox>
        )}

        {tab === 'sfx' && (
          <Flexbox gap={12}>
            <Field label={t('adVoice.sfx.text')}>
              <TextArea
                autoSize={{ maxRows: 4, minRows: 2 }}
                maxLength={SFX_MAX_CHARS}
                placeholder={t('adVoice.sfx.textPlaceholder')}
                value={sfxText}
                onChange={(e) => setSfxText(e.target.value)}
              />
            </Field>
            <Field
              label={t('adVoice.sfx.duration', {
                value: sfxDuration === undefined ? t('adVoice.sfx.auto') : `${sfxDuration}s`,
              })}
            >
              <SliderWithInput
                max={SFX_DURATION_MAX_S}
                min={SFX_DURATION_MIN_S}
                step={0.5}
                value={sfxDuration ?? 5}
                onChange={(v) => setSfxDuration(Number(v))}
              />
            </Field>
            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <span className={styles.cost}>
                {t('adVoice.sfx.estimate', { cost: formatUsd(estimateSfxCost(sfxDuration)) })}
              </span>
              <Button
                disabled={!canCreate || !sfxText.trim()}
                loading={busy}
                type={'primary'}
                onClick={generateSfx}
              >
                {t('adVoice.sfx.generate')}
              </Button>
            </Flexbox>
            {sfx && <AudioResult audio={sfx} />}
          </Flexbox>
        )}

        {tab === 'avatar' && avatarEnabled && (
          <Flexbox gap={12}>
            <div className={styles.disclosure}>{t('adVoice.avatar.disclosure')}</div>
            <Field label={t('adVoice.avatar.mode')}>
              <Segmented
                block
                value={avatarMode}
                options={[
                  { label: t('adVoice.avatar.talkingPhoto'), value: 'talkingPhoto' },
                  { label: t('adVoice.avatar.dubClip'), value: 'dubClip' },
                ]}
                onChange={(v) => setAvatarMode(v as AvatarMode)}
              />
            </Field>

            <input
              accept={'image/*'}
              ref={performerInputRef}
              style={{ display: 'none' }}
              type={'file'}
              onChange={onFile('photo')}
            />
            <input
              accept={'video/*'}
              ref={clipInputRef}
              style={{ display: 'none' }}
              type={'file'}
              onChange={onFile('clip')}
            />
            <input
              accept={'audio/*'}
              ref={audioInputRef}
              style={{ display: 'none' }}
              type={'file'}
              onChange={onFile('audio')}
            />

            {avatarMode === 'talkingPhoto' ? (
              <Field label={t('adVoice.avatar.performer')}>
                <Flexbox horizontal align={'center'} gap={12}>
                  {effectivePerformer && (
                    <img alt={'performer'} className={styles.preview} src={effectivePerformer} />
                  )}
                  <Flexbox gap={4}>
                    <Button
                      icon={<Upload size={14} />}
                      loading={uploading === 'photo'}
                      size={'small'}
                      onClick={() => performerInputRef.current?.click()}
                    >
                      {effectivePerformer
                        ? t('adVoice.avatar.replacePhoto')
                        : t('adVoice.avatar.uploadPhoto')}
                    </Button>
                    {!performerUrl && startFrame && (
                      <span className={styles.cost}>{t('adVoice.avatar.usingStartFrame')}</span>
                    )}
                  </Flexbox>
                </Flexbox>
              </Field>
            ) : (
              <Field label={t('adVoice.avatar.clip')}>
                <Flexbox horizontal align={'center'} gap={12}>
                  {clipUrl && <video muted className={styles.preview} src={clipUrl} />}
                  <Button
                    icon={<Upload size={14} />}
                    loading={uploading === 'clip'}
                    size={'small'}
                    onClick={() => clipInputRef.current?.click()}
                  >
                    {clipUrl ? t('adVoice.avatar.replaceClip') : t('adVoice.avatar.uploadClip')}
                  </Button>
                </Flexbox>
              </Field>
            )}

            <Field label={t('adVoice.avatar.audio')}>
              <Flexbox gap={6}>
                {avatarAudioUrl ? (
                  <audio controls className={styles.player} src={avatarAudioUrl} />
                ) : (
                  <span className={styles.cost}>{t('adVoice.avatar.noAudio')}</span>
                )}
                <Flexbox horizontal gap={8}>
                  <Button size={'small'} onClick={() => setTab('speech')}>
                    {t('adVoice.avatar.recordVoice')}
                  </Button>
                  <Button
                    icon={<Upload size={14} />}
                    loading={uploading === 'audio'}
                    size={'small'}
                    onClick={() => audioInputRef.current?.click()}
                  >
                    {t('adVoice.avatar.uploadAudio')}
                  </Button>
                </Flexbox>
              </Flexbox>
            </Field>

            {avatarMode === 'talkingPhoto' && (
              <Field label={t('adVoice.avatar.resolution', { cap: String(audioCap) })}>
                <Segmented
                  value={avatarResolution}
                  options={[
                    { label: '720p', value: '720p' },
                    { label: '1080p', value: '1080p' },
                  ]}
                  onChange={(v) => setAvatarResolution(v as AvatarResolution)}
                />
              </Field>
            )}

            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <span className={styles.cost}>
                {t('adVoice.avatar.estimate', {
                  cost: formatUsd(avatarCost),
                  seconds: String(avatarAudioSeconds),
                })}
              </span>
              <Button
                data-testid={'advoice-generate-avatar'}
                disabled={!canCreate || !avatarReady}
                loading={busy}
                type={'primary'}
                onClick={generateAvatar}
              >
                {t('adVoice.avatar.generate')}
              </Button>
            </Flexbox>
          </Flexbox>
        )}
      </Flexbox>
    </ImperativeModal>
  );
});

/** Toolbar entry point for the video workspace. */
const AdVoiceAction = memo(() => {
  const { t } = useTranslation('video');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Action icon={Mic} title={t('adVoice.title')} onClick={() => setOpen(true)} />
      {open && <AdVoiceModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
});

AdVoiceAction.displayName = 'AdVoiceAction';

export default AdVoiceAction;
