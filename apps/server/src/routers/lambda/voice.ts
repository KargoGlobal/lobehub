import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import {
  requireWorkspaceRoleWhenScoped,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { FileService } from '@/server/services/file';

/**
 * Generated audio for the creative tools: voiceover, music bed, sound effect.
 *
 * Audio is stored as an ordinary file (not a generation) on purpose. The
 * generation pipelines post-process their output as an image (sharp) or a
 * video (ffmpeg screenshot) — an MP3 fails both — and the audio's job here is
 * to feed the next step (a talking-performer clip, a final cut), so a stable,
 * reusable file URL is what callers need.
 */
const voiceProcedure = wsCompatProcedure
  .use(serverDatabase)
  .use(requireWorkspaceRoleWhenScoped('member'))
  .use(withScopedPermission('file:upload'));

export const VOICE_KINDS = ['speech', 'music', 'sfx'] as const;
export type VoiceKind = (typeof VOICE_KINDS)[number];

/** Model ids per kind; the UI picks one, the server refuses anything else. */
export const VOICE_MODELS: Record<VoiceKind, readonly string[]> = {
  music: ['fal-ai/elevenlabs/music'],
  sfx: ['fal-ai/elevenlabs/sound-effects/v2'],
  speech: ['fal-ai/elevenlabs/tts/turbo-v2.5', 'fal-ai/minimax/speech-2.8-hd'],
};

// ElevenLabs Turbo tops out at 5k chars/request; MiniMax at 10k. A 60s ad
// script is ~900 chars, so 5k is generous and keeps the bill bounded.
export const MAX_SPEECH_CHARS = 5000;
export const MAX_MUSIC_PROMPT_CHARS = 2000;
export const MAX_SFX_CHARS = 450;

const generateVoiceInputSchema = z
  .object({
    kind: z.enum(VOICE_KINDS),
    model: z.string().min(1),
    params: z
      .object({
        durationSeconds: z.number().min(0.5).max(22).optional(),
        emotion: z.string().optional(),
        instrumental: z.boolean().optional(),
        languageCode: z.string().optional(),
        lengthMs: z.number().int().min(3000).max(600_000).optional(),
        speed: z.number().min(0.5).max(2).optional(),
        stability: z.number().min(0).max(1).optional(),
      })
      .optional(),
    provider: z.string().default('fal'),
    text: z.string().min(1).max(Math.max(MAX_SPEECH_CHARS, MAX_MUSIC_PROMPT_CHARS)),
    voice: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (!VOICE_MODELS[input.kind].includes(input.model)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Model "${input.model}" is not a ${input.kind} model`,
        path: ['model'],
      });
    }
    const limit =
      input.kind === 'speech'
        ? MAX_SPEECH_CHARS
        : input.kind === 'music'
          ? MAX_MUSIC_PROMPT_CHARS
          : MAX_SFX_CHARS;
    if (input.text.length > limit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Text is limited to ${limit} characters for ${input.kind}`,
        path: ['text'],
      });
    }
  });

export type GenerateVoiceInput = z.infer<typeof generateVoiceInputSchema>;

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 40) || 'audio';

export const voiceRouter = router({
  generate: voiceProcedure.input(generateVoiceInputSchema).mutation(async ({ ctx, input }) => {
    const workspaceId = ctx.workspaceId ?? undefined;

    const runtime = await initModelRuntimeFromDB(
      ctx.serverDB,
      ctx.userId,
      input.provider,
      workspaceId,
    );

    const bytes = await runtime.textToSpeech(
      {
        input: input.text,
        model: input.model,
        params: input.params,
        voice: input.voice ?? '',
      },
      { user: ctx.userId },
    );

    if (!bytes) {
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: `Provider "${input.provider}" does not support audio generation.`,
      });
    }

    const fileService = new FileService(ctx.serverDB, ctx.userId, workspaceId);
    const stamp = Date.now();
    const pathname = `generations/audio/${input.kind}_${slug(input.text)}_${stamp}.mp3`;
    const { fileId, url } = await fileService.uploadFromBuffer(
      Buffer.from(bytes),
      'audio/mpeg',
      pathname,
    );

    return { fileId, kind: input.kind, size: bytes.byteLength, url };
  }),
});
