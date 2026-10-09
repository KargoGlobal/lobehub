import { execFile } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import { type LobeChatDatabase } from '@lobechat/database';
import debug from 'debug';
import { nanoid } from 'nanoid';

import { FileService } from '@/server/services/file';
import { getYYYYmmddHHMMss } from '@/utils/time';

const log = debug('lobe-video:final-cut-service');
const execFileAsync = promisify(execFile);

// Mirrors services/generation/video.ts's lazy ffmpeg-static loader. Duplicated rather than
// imported because video.ts keeps it private; this is the only other ffmpeg call site in the
// codebase today, so a shared util felt premature.
let _ffmpegPath: string | null = null;

function getFfmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath;
  _ffmpegPath = require('ffmpeg-static') as string;
  return _ffmpegPath;
}

export interface FinalCutAssembleResult {
  durationSeconds: number;
  fileId: string;
  url: string;
}

interface VideoProbe {
  duration: number;
  height: number;
  width: number;
}

/** Output is normalized to 30fps; re-encoding every clip already forces one fps, this just picks it. */
const TARGET_FPS = 30;

/** Fallback canvas when the first clip's dimensions can't be parsed from ffmpeg's probe output. */
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;

/** Max size for a single downloaded clip or audio track: 500 MB, same cap as the video generation pipeline. */
const MAX_INPUT_SIZE = 500 * 1024 * 1024;
/** Download timeout per source file. */
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

const evenize = (n: number) => (n % 2 === 0 ? n : n - 1);

/**
 * CTV broadcast loudness target. ATSC A/85 (US broadcast, and what most CTV publishers and
 * SSPs QC against): -24 LKFS integrated, true peak no higher than -2 dBTP. Single-pass
 * `loudnorm` lands within about ±1 LU of the target, inside A/85's ±2 LU tolerance.
 */
export const CTV_LOUDNESS = { integratedLkfs: -24, loudnessRange: 11, truePeakDbtp: -2 };

/** Music bed level before ducking (~-4.4 dB) so it already sits under a voiceover. */
export const MUSIC_BED_GAIN = 0.6;

/**
 * Demuxers allowed for user-supplied audio inputs. Keeps ffmpeg from treating an uploaded
 * ".mp3" that is really an HLS/concat playlist as a playlist and pulling in local files.
 */
export const AUDIO_FORMAT_WHITELIST = 'mov,mp4,m4a,3gp,mp3,wav,aac,ogg,flac,matroska,webm';

/** Max fade-out applied to a music bed so the cut doesn't end on a chopped note. */
const MUSIC_FADE_OUT_SECONDS = 1;

export interface FinalCutAudioOptions {
  /** Normalize the exported audio to {@link CTV_LOUDNESS}. */
  ctvLoudness?: boolean;
  /** Music bed, ducked under the voiceover (`audioKey`) whenever both are given. */
  musicKey?: string;
}

/** First-pass `loudnorm` statistics (its print_format=json output). */
export interface LoudnormMeasurement {
  input_i: string;
  input_lra: string;
  input_thresh: string;
  input_tp: string;
  target_offset: string;
}

export interface AudioMixInput {
  ctvLoudness: boolean;
  durationSeconds: number;
  hasMusic: boolean;
  hasVoice: boolean;
  /**
   * With ctvLoudness: omitted → measurement pass (loudnorm prints its stats); given → linear
   * second pass that applies one constant gain, so ducking and fades keep their shape.
   */
  measured?: LoudnormMeasurement;
}

/** Pulls loudnorm's JSON block out of ffmpeg stderr; null when absent or malformed. */
export function parseLoudnormMeasurement(stderr: string): LoudnormMeasurement | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  try {
    const json = JSON.parse(stderr.slice(start, end + 1));
    const keys = ['input_i', 'input_lra', 'input_thresh', 'input_tp', 'target_offset'] as const;
    // Silence measures as "-inf"; linear mode can't use that, so treat it as unmeasured.
    if (!keys.every((k) => typeof json[k] === 'string' && Number.isFinite(Number(json[k])))) {
      return null;
    }
    return Object.fromEntries(keys.map((k) => [k, json[k]])) as unknown as LoudnormMeasurement;
  } catch {
    return null;
  }
}

/**
 * Builds the `-filter_complex` graph for the mux pass. Input 0 is the concatenated video;
 * the voiceover (when present) is input 1 and the music bed the next input after it. The
 * graph always ends in the `[aout]` label.
 *
 * - voice + music: the bed is sidechain-compressed keyed off the voice, so it ducks while
 *   someone is speaking and comes back up in the gaps, then the two are summed.
 * - music: faded out over the last second of the video.
 * - ctvLoudness: normalized to CTV_LOUDNESS, then resampled back to 48 kHz (loudnorm
 *   upsamples internally).
 */
export function buildAudioMixFilter(input: AudioMixInput): string {
  const { ctvLoudness, durationSeconds, hasMusic, hasVoice, measured } = input;
  if (!hasVoice && !hasMusic) throw new Error('buildAudioMixFilter needs at least one track');

  const format = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const voiceIndex = 1;
  const musicIndex = hasVoice ? 2 : 1;
  const graph: string[] = [];

  if (hasVoice && hasMusic) {
    graph.push(
      // The compressor stops emitting once its sidechain input ends, so the key is padded
      // with silence: otherwise the bed would cut out the moment the voiceover finishes.
      `[${voiceIndex}:a]${format},asplit=2[vo][k0]`,
      '[k0]apad[key]',
      `[${musicIndex}:a]${format},volume=${MUSIC_BED_GAIN}[bed]`,
      '[bed][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[duck]',
      '[vo][duck]amix=inputs=2:duration=longest:normalize=0[mix]',
    );
  } else {
    graph.push(`[${hasVoice ? voiceIndex : musicIndex}:a]${format}[mix]`);
  }

  // amix emits gappy timestamps once one input ends, which makes afade (pts-based) miss its
  // window; renumbering samples gives every later filter a clean, continuous timeline.
  const tail: string[] = ['asetpts=N/SR/TB'];
  // Fade before loudnorm: the measurement then includes the fade, so the linear second pass
  // (one constant gain) lands on target even on a 6s spot where the fade is 1/6 of it.
  if (hasMusic && durationSeconds > 0) {
    const fade = Math.min(MUSIC_FADE_OUT_SECONDS, durationSeconds / 4);
    tail.push(`afade=t=out:st=${(durationSeconds - fade).toFixed(3)}:d=${fade.toFixed(3)}`);
  }
  if (ctvLoudness) {
    const { integratedLkfs, loudnessRange, truePeakDbtp } = CTV_LOUDNESS;
    const target = `I=${integratedLkfs}:TP=${truePeakDbtp}:LRA=${loudnessRange}`;
    tail.push(
      measured
        ? `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
        : `loudnorm=${target}:print_format=json`,
      'aresample=48000',
    );
  } else if (hasVoice && hasMusic) {
    // Summing without normalization can clip a hot voiceover; loudnorm's true-peak limit
    // covers this when CTV loudness is on.
    tail.push('alimiter=limit=0.95:level=false');
  }
  graph.push(`[mix]${tail.join(',')}[aout]`);

  return graph.join(';');
}

export class FinalCutService {
  private fileService: FileService;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.fileService = new FileService(db, userId, workspaceId);
  }

  /**
   * Concatenate `clipKeys` in order into one MP4 and, if `audioKey` is given, replace the
   * result's audio track with it. Uploads the output as an ordinary file (not a generation,
   * same rationale as voice.ts) and returns its fileId/url/duration.
   *
   * `clipKeys`/`audioKey` are this app's own storage keys (e.g. `generations/videos/...`),
   * never raw client-supplied URLs — the caller (the finalCut lambda router) must resolve and
   * validate every URL via `fileService.getKeyFromFullUrl` before calling this method, and
   * reject the request outright if any URL doesn't resolve to a real stored object. Unlike the
   * image/video generation routers — which only ever forward a URL to a third party (fal.ai) to
   * fetch — this service downloads the URL itself, so accepting an arbitrary URL here would be a
   * direct SSRF vector (internal services, cloud metadata endpoints, etc.). Resolving to a key
   * first, then re-resolving that key to a fresh signed URL with `fileService.getFullFileUrl`
   * right before every download (see `downloadToTemp`), means the only thing this method ever
   * fetches is a URL it derived itself from an object already confirmed to live in this app's
   * own storage.
   *
   * Audio-replace rule (documented once, here, since it governs both the "no audio" and
   * "audio provided" paths): the final cut's audio track is always REPLACED, never mixed with
   * whatever each clip originally carried. Clips concatenated from separate generations rarely
   * share usable native audio (different models, different takes, often silent). The
   * replacement can itself be a mix: `audioKey` is the voiceover / talk track and
   * `options.musicKey` a music bed ducked under it (see buildAudioMixFilter), optionally
   * normalized to CTV broadcast loudness.
   *
   * Duration rule: the OUTPUT duration always equals the concatenated VIDEO duration. A longer
   * audio track is trimmed to the video's length; a shorter one just leaves the tail of the
   * video playing silently. This is enforced with a single `-t <videoDuration>` on the mux pass
   * rather than `-shortest` (which would do the wrong thing — cut the video short — whenever the
   * audio happens to be the shorter stream).
   */
  async assembleFinalCut(
    clipKeys: string[],
    audioKey?: string,
    options: FinalCutAudioOptions = {},
  ): Promise<FinalCutAssembleResult> {
    if (clipKeys.length === 0) {
      throw new Error('assembleFinalCut requires at least one clip key');
    }

    log('Assembling final cut from %d clip(s), audio: %s', clipKeys.length, audioKey ?? 'none');

    const tempClipPaths: string[] = [];
    const normalizedPaths: string[] = [];
    let listFilePath: string | null = null;
    let concatPath: string | null = null;
    let audioPath: string | null = null;
    let musicPath: string | null = null;
    let finalPath: string | null = null;

    try {
      // 1. Download every source clip (+ the optional audio track) to temp files. Each key is
      // re-resolved to a fresh URL right here — see the SSRF note above.
      for (const key of clipKeys) {
        const url = await this.fileService.getFullFileUrl(key);
        tempClipPaths.push(await this.downloadToTemp(url, '.mp4'));
      }
      if (audioKey) {
        const url = await this.fileService.getFullFileUrl(audioKey);
        audioPath = await this.downloadToTemp(url, '.mp3');
      }
      if (options.musicKey) {
        const url = await this.fileService.getFullFileUrl(options.musicKey);
        musicPath = await this.downloadToTemp(url, '.mp3');
      }

      // 2. Probe the first clip to pick one common canvas. Clips can come from different
      // video models/generations with different resolutions, frame rates and even codecs, so a
      // raw stream-copy concat would silently produce a corrupt or unplayable file the moment
      // two clips disagree on codec parameters. Re-encoding every clip to one canvas/fps/codec
      // first makes the concat step a safe, uniform stream copy.
      const firstProbe = await this.probeVideo(tempClipPaths[0]);
      const targetWidth = evenize(firstProbe.width > 0 ? firstProbe.width : FALLBACK_WIDTH);
      const targetHeight = evenize(firstProbe.height > 0 ? firstProbe.height : FALLBACK_HEIGHT);

      // 3. Normalize each clip onto that canvas. Audio is stripped here (`-an`) because the
      // final mux step always replaces/attaches audio separately (see the audio-replace rule
      // above) — carrying mismatched native audio through the concat step would add nothing but
      // risk of another stream-mismatch failure.
      for (const clipPath of tempClipPaths) {
        const normalizedPath = path.join(os.tmpdir(), `lobe-finalcut-norm-${nanoid()}.mp4`);
        await execFileAsync(getFfmpegPath(), [
          '-y',
          '-i',
          clipPath,
          '-an',
          '-vf',
          `scale=w=${targetWidth}:h=${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${TARGET_FPS}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-pix_fmt',
          'yuv420p',
          normalizedPath,
        ]);
        normalizedPaths.push(normalizedPath);
      }

      // 4. Concatenate the now-uniform clips via the concat demuxer with a stream copy.
      listFilePath = path.join(os.tmpdir(), `lobe-finalcut-list-${nanoid()}.txt`);
      const listContents = normalizedPaths
        .map((p) => `file '${p.replaceAll("'", "'\\''")}'`)
        .join('\n');
      await fs.writeFile(listFilePath, listContents, 'utf8');

      concatPath = path.join(os.tmpdir(), `lobe-finalcut-concat-${nanoid()}.mp4`);
      await execFileAsync(getFfmpegPath(), [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFilePath,
        '-c',
        'copy',
        concatPath,
      ]);

      const { duration: videoDurationSeconds } = await this.probeVideo(concatPath);
      if (!(videoDurationSeconds > 0)) {
        throw new Error('Could not determine the final cut duration');
      }

      // 5. Attach the replacement audio track, if any. `-t <videoDuration>` is what implements
      // the duration rule documented on this method: cap the output at the video's length no
      // matter which of the two streams is longer.
      const needsMix = !!musicPath || (!!audioPath && !!options.ctvLoudness);
      if (needsMix) {
        finalPath = path.join(os.tmpdir(), `lobe-finalcut-final-${nanoid()}.mp4`);
        const audioInputs = [audioPath, musicPath].filter((p): p is string => Boolean(p));
        const inputArgs = [
          '-i',
          concatPath,
          ...audioInputs.flatMap((p) => ['-format_whitelist', AUDIO_FORMAT_WHITELIST, '-i', p]),
        ];
        const mixInput = {
          ctvLoudness: !!options.ctvLoudness,
          durationSeconds: videoDurationSeconds,
          hasMusic: !!musicPath,
          hasVoice: !!audioPath,
        };

        // Two-pass loudness: single-pass loudnorm is dynamic and can land several LU off
        // target on short spots (measured -28 LUFS on a 15s cut), outside A/85's ±2 LU.
        let measured: LoudnormMeasurement | undefined;
        if (mixInput.ctvLoudness) {
          const stderr = await this.runMux([
            '-y',
            ...inputArgs,
            '-filter_complex',
            buildAudioMixFilter(mixInput),
            '-map',
            '[aout]',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-t',
            String(videoDurationSeconds),
            '-f',
            'null',
            '-',
          ]);
          measured = parseLoudnormMeasurement(stderr) ?? undefined;
          if (!measured) log('loudnorm measurement unavailable, falling back to single pass');
        }

        await this.runMux([
          '-y',
          ...inputArgs,
          '-filter_complex',
          buildAudioMixFilter({ ...mixInput, measured }),
          '-map',
          '0:v:0',
          '-map',
          '[aout]',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-t',
          String(videoDurationSeconds),
          finalPath,
        ]);
      } else if (audioPath) {
        finalPath = path.join(os.tmpdir(), `lobe-finalcut-final-${nanoid()}.mp4`);
        await this.runMux([
          '-y',
          '-i',
          concatPath,
          '-format_whitelist',
          AUDIO_FORMAT_WHITELIST,
          '-i',
          audioPath,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-t',
          String(videoDurationSeconds),
          finalPath,
        ]);
      } else {
        finalPath = concatPath;
      }

      const buffer = await fs.readFile(finalPath);
      const exportsFolder = 'generations/video-exports';
      const dateTime = getYYYYmmddHHMMss(new Date());
      const pathname = `${exportsFolder}/final-cut_${nanoid()}_${dateTime}.mp4`;

      const { fileId, url } = await this.fileService.uploadFromBuffer(
        buffer,
        'video/mp4',
        pathname,
      );

      log('Final cut assembled and uploaded: %s (%ds)', url, videoDurationSeconds);

      return { durationSeconds: videoDurationSeconds, fileId, url };
    } finally {
      const allTempPaths = [
        ...tempClipPaths,
        ...normalizedPaths,
        listFilePath,
        concatPath,
        audioPath,
        musicPath,
        // Don't double-delete: finalPath is only distinct from concatPath when audio was muxed.
        finalPath !== concatPath ? finalPath : null,
      ].filter((p): p is string => Boolean(p));

      await Promise.all(
        allTempPaths.map((p) =>
          fs.unlink(p).catch((err) => log('Failed to cleanup temp final-cut file %s: %O', p, err)),
        ),
      );
    }
  }

  /** Runs the mux pass, turning ffmpeg's "no audio stream" failure into a readable error. */
  private async runMux(args: string[]): Promise<string> {
    try {
      const { stderr } = await execFileAsync(getFfmpegPath(), args);
      return String(stderr ?? '');
    } catch (error: any) {
      const stderr = String(error?.stderr ?? '');
      if (/matches no streams|does not contain any stream/.test(stderr)) {
        throw new Error('The voiceover or music bed file has no audio track', { cause: error });
      }
      throw error;
    }
  }

  private async downloadToTemp(url: string, fallbackExt: string): Promise<string> {
    const ext = path.extname(new URL(url).pathname).toLowerCase() || fallbackExt;
    const tempPath = path.join(os.tmpdir(), `lobe-finalcut-src-${nanoid()}${ext}`);
    log('Downloading %s to %s', url, tempPath);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength && contentLength > MAX_INPUT_SIZE) {
      throw new Error(`File too large: ${contentLength} bytes (max ${MAX_INPUT_SIZE} bytes)`);
    }

    if (!response.body) {
      throw new Error(`Response body is empty for: ${url}`);
    }

    let downloadedSize = 0;
    const sizeCheckTransform = new TransformStream({
      transform(chunk, controller) {
        downloadedSize += chunk.byteLength;
        if (downloadedSize > MAX_INPUT_SIZE) {
          controller.error(
            new Error(`File too large: exceeded ${MAX_INPUT_SIZE} bytes during download`),
          );
          return;
        }
        controller.enqueue(chunk);
      },
    });

    const limitedBody = response.body.pipeThrough(sizeCheckTransform);
    await pipeline(Readable.fromWeb(limitedBody as any), createWriteStream(tempPath));

    return tempPath;
  }

  /** Same ffmpeg `-i` stderr-scrape technique as VideoGenerationService.getVideoMetadata. */
  private async probeVideo(videoPath: string): Promise<VideoProbe> {
    const ffmpegPath = getFfmpegPath();

    let stderr: string;
    try {
      const result = await execFileAsync(ffmpegPath, ['-i', videoPath, '-hide_banner']);
      stderr = result.stderr;
    } catch (error: any) {
      stderr = error.stderr || '';
      if (!stderr) throw error;
    }

    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const duration = durationMatch
      ? Number.parseInt(durationMatch[1]) * 3600 +
        Number.parseInt(durationMatch[2]) * 60 +
        Number.parseFloat(durationMatch[3])
      : 0;

    const streamMatch = stderr.match(/Stream.*Video.*?(\d{2,5})x(\d{2,5})/);

    return {
      duration,
      height: streamMatch ? Number.parseInt(streamMatch[2]) : 0,
      width: streamMatch ? Number.parseInt(streamMatch[1]) : 0,
    };
  }
}
