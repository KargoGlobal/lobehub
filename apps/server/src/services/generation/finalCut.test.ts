import { promises as fs } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileService } from '@/server/services/file';

// Same node:child_process / node:util mocking technique as
// services/mcp/deps/checkers/NpmInstallationChecker.test.ts — intercept promisify(execFile)
// with one hoisted mock so ffmpeg is never actually invoked, while we assert on the exact
// argv each call would have received.
const { mockExecFileAsync, mockFetch, mockGetFullFileUrl, mockUploadFromBuffer } = vi.hoisted(
  () => ({
    mockExecFileAsync: vi.fn(),
    mockFetch: vi.fn(),
    mockGetFullFileUrl: vi.fn(),
    mockUploadFromBuffer: vi.fn(),
  }),
);

vi.mock('node:child_process');
vi.mock('node:util', () => ({
  default: { promisify: () => mockExecFileAsync },
  promisify: () => mockExecFileAsync,
}));
vi.mock('@/server/services/file');
vi.mock('debug', () => ({ default: vi.fn(() => vi.fn()) }));

const { buildAudioMixFilter, FinalCutService } = await import('./finalCut');

// A real ffmpeg `-i <file> -hide_banner` probe (no output arg) exits 1 with metadata on
// stderr — video.ts's getVideoMetadata and finalCut.ts's probeVideo both scrape this shape.
const PROBE_STDERR = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x':
  Duration: 00:00:05.00, start: 0.000000, bitrate: 500 kb/s
    Stream #0:0(und): Video: h264 (High), yuv420p, 640x360, 500 kb/s, 30 fps, 30 tbr, 600 tbn`;

function fakeResponse() {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.close();
      },
    }),
    headers: { get: () => null },
    ok: true,
    status: 200,
    statusText: 'OK',
  } as unknown as Response;
}

describe('FinalCutService.assembleFinalCut', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(FileService).mockImplementation(
      () =>
        ({
          getFullFileUrl: mockGetFullFileUrl,
          uploadFromBuffer: mockUploadFromBuffer,
        }) as any,
    );
    mockUploadFromBuffer.mockResolvedValue({
      fileId: 'file-1',
      key: 'generations/video-exports/final-cut_x.mp4',
      url: 'https://app.example.com/f/file-1',
    });
    // Every key resolves to a distinct signed download URL — assembleFinalCut must never fetch
    // the key string itself, only this resolved URL (the SSRF-relevant contract under test).
    mockGetFullFileUrl.mockImplementation(async (key: string) => `https://cdn.example.com/${key}`);

    mockFetch.mockImplementation(() => Promise.resolve(fakeResponse()));
    vi.stubGlobal('fetch', mockFetch);

    // Every probe call (`-hide_banner`, no output path) returns canned metadata; every other
    // call is an encode/concat/mux pass, so write a stub file to its output path (the last
    // argv entry) — the service reads that file back to build the upload buffer, and a real
    // ffmpeg would have written it there.
    mockExecFileAsync.mockImplementation(async (_ffmpegPath: string, args: string[]) => {
      if (args.includes('-hide_banner')) {
        return { stderr: PROBE_STDERR, stdout: '' };
      }
      const outputPath = args.at(-1) as string;
      await fs.writeFile(outputPath, Buffer.from('fake-ffmpeg-output'));
      return { stderr: '', stdout: '' };
    });
  });

  it("normalizes clips to the first clip's canvas, concatenates, muxes in the audio, and trims the mux to the video duration", async () => {
    const service = new FinalCutService({} as any, 'user-1');

    const result = await service.assembleFinalCut(
      ['generations/videos/clip-a.mp4', 'generations/videos/clip-b.mp4'],
      'generations/audio/voiceover.mp3',
    );

    expect(result).toEqual({
      durationSeconds: 5,
      fileId: 'file-1',
      url: 'https://app.example.com/f/file-1',
    });

    // Every key is resolved to a signed URL, and only that resolved URL is ever fetched — never
    // the raw key/a client-supplied URL. This is the SSRF-relevant contract (see the doc comment
    // on assembleFinalCut): the only things this service fetches are URLs it derived itself from
    // keys already confirmed to live in this app's own storage.
    expect(mockGetFullFileUrl).toHaveBeenCalledWith('generations/videos/clip-a.mp4');
    expect(mockGetFullFileUrl).toHaveBeenCalledWith('generations/videos/clip-b.mp4');
    expect(mockGetFullFileUrl).toHaveBeenCalledWith('generations/audio/voiceover.mp3');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/generations/videos/clip-a.mp4',
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/generations/videos/clip-b.mp4',
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/generations/audio/voiceover.mp3',
      expect.anything(),
    );
    // Bare keys are never valid fetch targets — only a resolved https:// URL is.
    expect(mockFetch).not.toHaveBeenCalledWith('generations/videos/clip-a.mp4', expect.anything());

    const calls = mockExecFileAsync.mock.calls.map(([, args]) => args as string[]);

    // 1) probe the first clip
    expect(calls[0]).toEqual(expect.arrayContaining(['-i', '-hide_banner']));
    // 2 & 3) normalize each clip onto the probed 640x360 canvas, stripped of audio
    expect(calls[1]).toEqual(
      expect.arrayContaining([
        '-an',
        '-vf',
        'scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30',
        '-c:v',
        'libx264',
      ]),
    );
    expect(calls[2]).toEqual(expect.arrayContaining(['-an', '-vf']));
    // 4) concat demuxer, stream copy
    expect(calls[3]).toEqual(expect.arrayContaining(['-f', 'concat', '-safe', '0', '-c', 'copy']));
    // 5) probe the concatenated result for its duration
    expect(calls[4]).toEqual(expect.arrayContaining(['-i', '-hide_banner']));
    // 6) mux the audio in, replacing whatever the clips carried, capped to the video length
    expect(calls[5]).toEqual(
      expect.arrayContaining([
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-t',
        '5',
      ]),
    );

    expect(mockExecFileAsync).toHaveBeenCalledTimes(6);

    const [buffer, mime, pathname] = mockUploadFromBuffer.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(mime).toBe('video/mp4');
    expect(pathname).toMatch(/^generations\/video-exports\/final-cut_.*\.mp4$/);
  });

  it('skips the mux pass and uploads the concatenated clips directly when no audio is given', async () => {
    const service = new FinalCutService({} as any, 'user-1');

    await service.assembleFinalCut([
      'generations/videos/clip-a.mp4',
      'generations/videos/clip-b.mp4',
    ]);

    // probe + 2 normalize + concat + probe = 5 calls, no mux pass
    expect(mockExecFileAsync).toHaveBeenCalledTimes(5);
    const calls = mockExecFileAsync.mock.calls.map(([, args]) => args as string[]);
    expect(calls.some((args) => args.includes('1:a:0'))).toBe(false);

    expect(mockUploadFromBuffer).toHaveBeenCalledWith(
      expect.anything(),
      'video/mp4',
      expect.stringMatching(/^generations\/video-exports\/final-cut_.*\.mp4$/),
    );
  });

  it('rejects when given no clip urls', async () => {
    const service = new FinalCutService({} as any, 'user-1');
    await expect(service.assembleFinalCut([])).rejects.toThrow(/at least one clip/);
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it('ducks a music bed under the voiceover and normalizes to CTV loudness in one mux pass', async () => {
    const service = new FinalCutService({} as any, 'user-1');

    await service.assembleFinalCut(
      ['generations/videos/clip-a.mp4', 'generations/videos/clip-b.mp4'],
      'generations/audio/voiceover.mp3',
      { ctvLoudness: true, musicKey: 'generations/audio/bed.mp3' },
    );

    // The music bed goes through the same key -> signed URL resolution as every other input.
    expect(mockGetFullFileUrl).toHaveBeenCalledWith('generations/audio/bed.mp3');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/generations/audio/bed.mp3',
      expect.anything(),
    );

    expect(mockExecFileAsync).toHaveBeenCalledTimes(6);
    const mux = mockExecFileAsync.mock.calls[5][1] as string[];
    // video + voiceover + music bed
    expect(mux.filter((arg) => arg === '-i')).toHaveLength(3);
    const graph = mux[mux.indexOf('-filter_complex') + 1];
    expect(graph).toContain('sidechaincompress');
    expect(graph).toContain('loudnorm=I=-24:TP=-2');
    expect(mux).toEqual(expect.arrayContaining(['-map', '0:v:0', '-map', '[aout]', '-t', '5']));
  });

  it('normalizes a lone voiceover through the mix graph when CTV loudness is on', async () => {
    const service = new FinalCutService({} as any, 'user-1');

    await service.assembleFinalCut(
      ['generations/videos/clip-a.mp4', 'generations/videos/clip-b.mp4'],
      'generations/audio/voiceover.mp3',
      { ctvLoudness: true },
    );

    const mux = mockExecFileAsync.mock.calls[5][1] as string[];
    expect(mux.filter((arg) => arg === '-i')).toHaveLength(2);
    expect(mux[mux.indexOf('-filter_complex') + 1]).toContain('loudnorm');
  });
});

describe('buildAudioMixFilter', () => {
  it('keys the ducking compressor off the voiceover and sums voice + ducked bed', () => {
    const graph = buildAudioMixFilter({
      ctvLoudness: false,
      durationSeconds: 30,
      hasMusic: true,
      hasVoice: true,
    });
    expect(graph).toContain('[1:a]');
    expect(graph).toContain('[2:a]');
    expect(graph).toContain('[bed][key]sidechaincompress');
    expect(graph).toContain('[vo][duck]amix=inputs=2:duration=longest:normalize=0[mix]');
    expect(graph).toContain('afade=t=out:st=29.000:d=1.000');
    expect(graph).not.toContain('loudnorm');
    expect(graph.endsWith('[aout]')).toBe(true);
  });

  it('reads a music-only bed from input 1 and shortens the fade on very short cuts', () => {
    const graph = buildAudioMixFilter({
      ctvLoudness: true,
      durationSeconds: 2,
      hasMusic: true,
      hasVoice: false,
    });
    expect(graph).toContain('[1:a]');
    expect(graph).not.toContain('[2:a]');
    expect(graph).not.toContain('sidechaincompress');
    expect(graph).toContain('afade=t=out:st=1.500:d=0.500');
    expect(graph).toContain('loudnorm=I=-24:TP=-2:LRA=11,aresample=48000[aout]');
  });

  it('passes a lone voiceover through untouched when loudness is off', () => {
    expect(
      buildAudioMixFilter({
        ctvLoudness: false,
        durationSeconds: 15,
        hasMusic: false,
        hasVoice: true,
      }),
    ).toBe(
      '[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[mix];[mix]anull[aout]',
    );
  });

  it('throws without any audio input', () => {
    expect(() =>
      buildAudioMixFilter({
        ctvLoudness: true,
        durationSeconds: 15,
        hasMusic: false,
        hasVoice: false,
      }),
    ).toThrow(/at least one track/);
  });
});
