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
   * share usable native audio (different models, different takes, often silent) — replacing is
   * the simpler, more defensible default, and overlay/duck-under-voiceover mixing is out of
   * scope for this MVP.
   *
   * Duration rule: the OUTPUT duration always equals the concatenated VIDEO duration. A longer
   * audio track is trimmed to the video's length; a shorter one just leaves the tail of the
   * video playing silently. This is enforced with a single `-t <videoDuration>` on the mux pass
   * rather than `-shortest` (which would do the wrong thing — cut the video short — whenever the
   * audio happens to be the shorter stream).
   */
  async assembleFinalCut(clipKeys: string[], audioKey?: string): Promise<FinalCutAssembleResult> {
    if (clipKeys.length === 0) {
      throw new Error('assembleFinalCut requires at least one clip key');
    }

    log('Assembling final cut from %d clip(s), audio: %s', clipKeys.length, audioKey ?? 'none');

    const tempClipPaths: string[] = [];
    const normalizedPaths: string[] = [];
    let listFilePath: string | null = null;
    let concatPath: string | null = null;
    let audioPath: string | null = null;
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

      // 5. Attach the replacement audio track, if any. `-t <videoDuration>` is what implements
      // the duration rule documented on this method: cap the output at the video's length no
      // matter which of the two streams is longer.
      if (audioPath) {
        finalPath = path.join(os.tmpdir(), `lobe-finalcut-final-${nanoid()}.mp4`);
        await execFileAsync(getFfmpegPath(), [
          '-y',
          '-i',
          concatPath,
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
